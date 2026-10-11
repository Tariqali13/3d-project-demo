import { describe, expect, it } from 'vitest';
import { generateSite, STOCKPILE, PAD } from '../src/core/sample';
import { writeDxf, writeLandXml } from '../src/formats/write';
import { parseLandXml } from '../src/formats/landxml';
import { parseDxf } from '../src/formats/dxf';
import { TinIndex } from '../src/core/tinIndex';
import { gridVolume, toeElevation } from '../src/core/volume';

const site = generateSite(3);

describe('writers round-trip through the parsers', () => {
  it('LandXML keeps every vertex to the millimetre and every face', () => {
    const [back] = parseLandXml(writeLandXml(site.design));
    expect(back!.name).toBe(site.design.name);
    expect(back!.indices).toEqual(site.design.indices);
    for (let i = 0; i < back!.positions.length; i++) expect(back!.positions[i]).toBeCloseTo(site.design.positions[i]!, 3);
  });

  it('DXF keeps layers, elevations, closed flags and the road arc', () => {
    const text = writeDxf({
      polylines: [
        { layer: 'PAD', points: Float64Array.from([0, 0, 86, 10, 0, 86, 10, 10, 86]), closed: true },
        { layer: 'BRK', points: Float64Array.from([0, 0, 80, 5, 5, 81.5]), closed: false },
        { layer: 'ROAD', points: Float64Array.from([0, 0, 0, 10, 10, 0]), closed: false, bulges: [Math.tan(Math.PI / 8)] },
      ],
      points: [{ layer: 'CTRL', x: 411000.5, y: 763400.25, z: 84.125 }],
    });
    const d = parseDxf(text);
    expect(d.layers).toEqual(['BRK', 'CTRL', 'PAD', 'ROAD']);
    const pad = d.polylines.find((p) => p.layer === 'PAD')!;
    expect(pad.closed).toBe(true);
    expect(pad.points[2]).toBe(86);
    expect([...d.polylines.find((p) => p.layer === 'BRK')!.points]).toEqual([0, 0, 80, 5, 5, 81.5]);
    // A 90° arc of radius 10 centred at (0, 10): every tessellated point sits on it.
    const road = d.polylines.find((p) => p.layer === 'ROAD')!.points;
    expect(road.length / 3).toBeGreaterThan(4);
    for (let i = 0; i < road.length; i += 3) expect(Math.hypot(road[i]!, road[i + 1]! - 10)).toBeCloseTo(10, 6);
    expect(d.points[0]).toEqual({ layer: 'CTRL', x: 411000.5, y: 763400.25, z: 84.125 });
  });
});

describe('the demo site', () => {
  const existing = new TinIndex(site.existing);

  it('has a stockpile whose measured volume matches the shape it was built from', () => {
    const base = toeElevation(site.stockpileToe, existing);
    const r = gridVolume(existing, () => base, { cell: 0.5, boundary: site.stockpileToe });
    // Numerical integral of the generating profile (ignores ground undulation under the pile).
    let expected = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const r0 = (STOCKPILE.radius * (i + 0.5)) / n;
      const h = r0 <= STOCKPILE.topRadius ? STOCKPILE.height : STOCKPILE.height * Math.sin(((STOCKPILE.radius - r0) / (STOCKPILE.radius - STOCKPILE.topRadius)) * (Math.PI / 2)) ** 1.25;
      expected += 2 * Math.PI * r0 * h * (STOCKPILE.radius / n);
    }
    expect(Math.abs(r.cut - r.fill - expected) / expected).toBeLessThan(0.08);
  });

  it('needs both cut and fill to build the pad', () => {
    const design = new TinIndex(site.design);
    const r = gridVolume(existing, (x, y) => design.zAt(x, y), { cell: 1 });
    expect(r.cut).toBeGreaterThan(200);
    expect(r.fill).toBeGreaterThan(200);
    expect(design.zAt(PAD.x0 + PAD.w / 2, PAD.y0 + PAD.h / 2)).toBeCloseTo(PAD.z, 6);
  });

  it('places everything in projected coordinates', () => {
    expect(site.existing.positions[0]).toBeGreaterThan(400000);
    expect(site.existing.positions[1]).toBeGreaterThan(700000);
  });
});
