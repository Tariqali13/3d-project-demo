import { describe, expect, it } from 'vitest';
import { bearing, distance, pointInPolygon, polygonArea, polylineLength } from '../src/core/geometry';
import { chooseOrigin, toLocal } from '../src/core/origin';
import { TinIndex } from '../src/core/tinIndex';
import { sampleProfile } from '../src/core/profile';
import { contourSegments, chainSegments } from '../src/core/contours';
import { boundsOf } from '../src/core/geometry';
import { gridTin } from './helpers';

const v = (x: number, y: number, z = 0) => ({ x, y, z });

describe('measurement', () => {
  it('distance reports plan, slope, rise and grade', () => {
    const d = distance(v(0, 0, 10), v(30, 40, 20));
    expect(d.horizontal).toBeCloseTo(50);
    expect(d.slope).toBeCloseTo(Math.hypot(50, 10));
    expect(d.dz).toBe(10);
    expect(d.gradePct).toBeCloseTo(20);
    expect(distance(v(1, 1, 0), v(1, 1, 5)).gradePct).toBeNull();
  });

  it('polygon area is planimetric and independent of winding', () => {
    const square = [v(0, 0, 5), v(10, 0, 9), v(10, 10, 1), v(0, 10, 3)];
    expect(polygonArea(square)).toBeCloseTo(100);
    expect(polygonArea([...square].reverse())).toBeCloseTo(100);
    expect(polylineLength(square, '2d', true)).toBeCloseTo(40);
  });

  it('point in polygon handles concave shapes', () => {
    const l = [v(0, 0), v(10, 0), v(10, 2), v(2, 2), v(2, 10), v(0, 10)];
    expect(pointInPolygon(1, 9, l)).toBe(true);
    expect(pointInPolygon(5, 5, l)).toBe(false);
  });

  it('bearings are clockwise from grid north', () => {
    expect(bearing(v(0, 0), v(0, 1))).toBeCloseTo(0);
    expect(bearing(v(0, 0), v(1, 0))).toBeCloseTo(90);
    expect(bearing(v(0, 0), v(-1, 0))).toBeCloseTo(270);
  });
});

describe('local origin', () => {
  it('keeps millimetre precision that float32 world coordinates lose', () => {
    const world = Float64Array.from([411020.373, 763528.271, 85.884]);
    // Straight to float32: the northing snaps to a 6.25 cm grid.
    expect(Math.abs(Math.fround(world[1]!) - world[1]!)).toBeGreaterThan(0.01);
    const o = chooseOrigin(boundsOf(world));
    const local = toLocal(world, o);
    expect(Math.abs(local[0]! + o.x - world[0]!)).toBeLessThan(1e-4);
    expect(Math.abs(local[1]! + o.y - world[1]!)).toBeLessThan(1e-4);
    expect(Math.abs(local[2]! + o.z - world[2]!)).toBeLessThan(1e-4);
  });
});

describe('TinIndex.zAt', () => {
  const plane = gridTin((x, y) => 100 + 0.1 * (x - 411000) - 0.05 * (y - 763400), { x0: 411000, y0: 763400, w: 50, h: 40, n: 20 });
  const idx = new TinIndex(plane);

  it('interpolates exactly on a plane, anywhere inside', () => {
    for (const [x, y] of [[411000, 763400], [411013.37, 763421.9], [411050, 763440], [411049.99, 763400.01]] as const) {
      expect(idx.zAt(x, y)).toBeCloseTo(100 + 0.1 * (x - 411000) - 0.05 * (y - 763400), 6);
    }
  });

  it('returns NaN outside the surface', () => {
    expect(idx.zAt(410999, 763410)).toBeNaN();
    expect(idx.zAt(411010, 763441)).toBeNaN();
  });

  it('handles sparse TINs with holes', () => {
    const t = gridTin(() => 5, { w: 10, h: 10, n: 2 });
    const holed = { ...t, indices: t.indices.slice(6) }; // drop the first cell's two triangles
    const hi = new TinIndex(holed);
    expect(hi.zAt(1, 1)).toBeNaN();
    expect(hi.zAt(8, 8)).toBe(5);
  });
});

describe('profiles', () => {
  it('samples every vertex and fills gaps with NaN', () => {
    const t = gridTin((x) => x, { w: 10, h: 10, n: 5 });
    const p = sampleProfile([v(0, 5), v(10, 5), v(10, 20)], [{ name: 'ground', index: new TinIndex(t) }], 1);
    expect(p.length).toBeCloseTo(25);
    const z = p.series[0]!.z;
    expect(z[0]).toBeCloseTo(0);
    const atBend = [...p.chainage].indexOf(10);
    expect(z[atBend]).toBeCloseTo(10);
    expect(z[z.length - 1]).toBeNaN(); // (10, 20) is off the surface
  });
});

describe('contours', () => {
  it('produces level lines at the right height and joins them', () => {
    // A cone: contours are circles.
    const cone = gridTin((x, y) => 10 - Math.hypot(x - 20, y - 20) / 2, { w: 40, h: 40, n: 40 });
    const c = contourSegments(cone, 2);
    // Apex is 10 m; the grid corners fall to about -4.1 m.
    expect(new Set(c.levels)).toEqual(new Set([-4, -2, 0, 2, 4, 6, 8]));
    for (let i = 0; i < c.levels.length; i++) expect(c.segments[i * 6 + 2]).toBe(c.levels[i]);
    const chains = chainSegments(c, 1e-6);
    const ring8 = chains.filter((ch) => ch.level === 8);
    expect(ring8).toHaveLength(1); // one closed ring, not hundreds of loose segments
    const [x0, y0] = ring8[0]!.points;
    expect(Math.hypot(x0! - 20, y0! - 20)).toBeCloseTo(4, 0);
  });
});

describe('contour chaining', () => {
  it('returns x, y, level triples in walking order', () => {
    const cone = gridTin((x, y) => 10 - Math.hypot(x - 20, y - 20) / 2, { w: 40, h: 40, n: 40 });
    const [ring] = chainSegments(contourSegments(cone, 2), 1e-6).filter((c) => c.level === 6);
    const p = ring!.points;
    expect(p.length % 3).toBe(0);
    for (let i = 2; i < p.length; i += 3) expect(p[i]).toBe(6);
    // Consecutive vertices are neighbours on the ring (no jumps), and the ring closes.
    for (let i = 3; i < p.length; i += 3) expect(Math.hypot(p[i]! - p[i - 3]!, p[i + 1]! - p[i - 2]!)).toBeLessThan(1.5);
    expect(Math.hypot(p[0]! - p[p.length - 3]!, p[1]! - p[p.length - 2]!)).toBeLessThan(1e-6);
  });
});
