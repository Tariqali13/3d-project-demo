import { describe, expect, it } from 'vitest';
import { TinIndex } from '../src/core/tinIndex';
import { gridVolume, toeElevation, vertexDifference, volumeAgainstPlane } from '../src/core/volume';
import { gridTin } from './helpers';

const v = (x: number, y: number, z = 0) => ({ x, y, z });

describe('volume against a plane (exact)', () => {
  it('a 10×10 block 3 m high is 300 m³', () => {
    const r = volumeAgainstPlane(gridTin(() => 103, { w: 10, h: 10, n: 4 }), 100);
    expect(r.cut).toBeCloseTo(300, 9);
    expect(r.fill).toBeCloseTo(0, 9);
    expect(r.area).toBeCloseTo(100, 9);
  });

  it('a tilted plane crossing the base splits cut and fill without cancelling', () => {
    // z - z0 = x - 5 over [0,10]²: wedge of 125 m³ above and 125 m³ below.
    const r = volumeAgainstPlane(gridTin((x) => 100 + x - 5, { w: 10, h: 10, n: 7 }), 100);
    expect(r.cut).toBeCloseTo(125, 6);
    expect(r.fill).toBeCloseTo(125, 6);
  });

  it('is exact for a piecewise-linear surface regardless of triangle size', () => {
    const coarse = volumeAgainstPlane(gridTin((x, y) => Math.abs(x - 5) + y * 0.3, { w: 10, h: 10, n: 10 }), 2);
    const fine = volumeAgainstPlane(gridTin((x, y) => Math.abs(x - 5) + y * 0.3, { w: 10, h: 10, n: 40 }), 2);
    expect(coarse.cut).toBeCloseTo(fine.cut, 6);
    expect(coarse.fill).toBeCloseTo(fine.fill, 6);
  });
});

describe('grid volume', () => {
  // A cone stockpile: radius 10 m, height 6 m. Analytic volume πr²h/3.
  const cone = gridTin((x, y) => 50 + Math.max(0, 6 - (6 * Math.hypot(x - 20, y - 20)) / 10), { w: 40, h: 40, n: 160 });
  const coneIdx = new TinIndex(cone);
  const analytic = (Math.PI * 100 * 6) / 3;

  it('matches the exact TIN volume within 0.5% at a 0.25 m grid', () => {
    const exact = volumeAgainstPlane(cone, 50).cut;
    const grid = gridVolume(coneIdx, () => 50, { cell: 0.25 }).cut;
    expect(Math.abs(grid - exact) / exact).toBeLessThan(0.005);
    // ...and the TIN itself is within 1% of the true cone.
    expect(Math.abs(exact - analytic) / analytic).toBeLessThan(0.01);
  });

  it('only counts cells inside the boundary', () => {
    const square = [v(5, 5), v(35, 5), v(35, 35), v(5, 35)];
    const inside = gridVolume(coneIdx, () => 50, { cell: 0.25, boundary: square });
    expect(inside.area).toBeCloseTo(900, -1);
    const half = gridVolume(coneIdx, () => 50, { cell: 0.25, boundary: [v(0, 0), v(20, 0), v(20, 40), v(0, 40)] });
    expect(half.cut / inside.cut).toBeCloseTo(0.5, 2);
  });

  it('existing vs design: cut where existing is above, fill where below, skipping uncovered cells', () => {
    const existing = new TinIndex(gridTin((x) => (x < 10 ? 12 : 8), { w: 20, h: 10, n: 80 }));
    const design = new TinIndex(gridTin(() => 10, { x0: 0, w: 15, h: 10, n: 4 }));
    const r = gridVolume(existing, (x, y) => design.zAt(x, y), { cell: 0.1 });
    expect(r.area).toBeCloseTo(150, 0); // design covers x 0-15 only
    expect(r.cut).toBeCloseTo(2 * 100, -1); // x 0-10, 2 m above
    expect(r.fill).toBeCloseTo(2 * 50, -1); // x 10-15, 2 m below
  });

  it('toe elevation is the mean ground level around the boundary', () => {
    const z = toeElevation([v(5, 5), v(35, 5), v(35, 35), v(5, 35)], coneIdx);
    expect(z).toBeCloseTo(50, 6);
  });

  it('per-vertex difference marks uncovered vertices as NaN', () => {
    const d = vertexDifference(gridTin(() => 12, { w: 10, h: 10, n: 2 }), new TinIndex(gridTin(() => 10, { w: 5, h: 10, n: 2 })));
    expect(d[0]).toBeCloseTo(2);
    expect(Number.isNaN(d[2]!)).toBe(true);
  });
});
