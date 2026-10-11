import { describe, expect, it } from 'vitest';
import { Engine, detectKind } from '../src/engine/engine';
import { generateSite, PAD } from '../src/core/sample';
import { writeDxf, writeLandXml } from '../src/formats/write';
import { flat } from '../src/core/sample';

const site = generateSite(4);
const existingXml = writeLandXml(site.existing);
const designXml = writeLandXml(site.design);

describe('Engine', () => {
  it('detects formats by extension or content', () => {
    expect(detectKind('a.DXF', '')).toBe('dxf');
    expect(detectKind('survey.txt', '<?xml version="1.0"?><LandXML>')).toBe('landxml');
    expect(detectKind('notes.txt', 'hello')).toBeNull();
  });

  it('rejects unknown files with a message that says what it reads', () => {
    expect(() => new Engine().load('photo.png', '\x89PNG')).toThrow(/LandXML or DXF/);
  });

  it('loads surfaces and drawings with bounds', () => {
    const e = new Engine();
    const [s] = e.load('existing.xml', existingXml);
    expect(s!.kind).toBe('surface');
    expect(s!.bounds.minX).toBeCloseTo(411000);
    const [d] = e.load('plan.dxf', writeDxf({ polylines: [{ layer: 'PAD', points: flat(site.padOutline), closed: true }] }));
    expect(d!.kind).toBe('drawing');
    expect(d!.bounds.maxX).toBeCloseTo(PAD.x0 + PAD.w);
  });

  it('computes cut/fill between two loaded surfaces', () => {
    const e = new Engine();
    const [ex] = e.load('existing.xml', existingXml);
    const [de] = e.load('design.xml', designXml);
    const r = e.cutFill(ex!.id, de!.id);
    expect(r.cut).toBeGreaterThan(0);
    expect(r.fill).toBeGreaterThan(0);
    expect(r.diff.length).toBe(site.existing.positions.length / 3);
    expect(r.range).toBeGreaterThan(0.5);
  });

  it('measures a stockpile from its toe and from a fixed base', () => {
    const e = new Engine();
    const [ex] = e.load('existing.xml', existingXml);
    const toe = e.stockpile(ex!.id, site.stockpileToe, { mode: 'toe' });
    expect(toe.volume).toBeGreaterThan(1500);
    const lower = e.stockpile(ex!.id, site.stockpileToe, { mode: 'fixed', z: toe.baseZ - 1 });
    // Lowering the base by 1 m adds roughly one metre times the boundary area.
    expect(lower.volume - toe.volume).toBeCloseTo(toe.area, -2);
  });

  it('explains a boundary that is off the surface', () => {
    const e = new Engine();
    const [ex] = e.load('existing.xml', existingXml);
    const far = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }];
    expect(() => e.stockpile(ex!.id, far, { mode: 'toe' })).toThrow(/outside the surface/);
  });

  it('profiles every requested surface along a line', () => {
    const e = new Engine();
    const [ex] = e.load('existing.xml', existingXml);
    const [de] = e.load('design.xml', designXml);
    const line = [{ x: PAD.x0 - 30, y: PAD.y0 + 20, z: 0 }, { x: PAD.x0 + PAD.w + 30, y: PAD.y0 + 20, z: 0 }];
    const p = e.profile(line, [ex!.id, de!.id]);
    expect(p.series).toHaveLength(2);
    expect(p.length).toBeCloseTo(PAD.w + 60);
    const mid = Math.floor(p.chainage.length / 2);
    expect(p.series[1]!.z[mid]).toBeCloseTo(PAD.z, 6);
  });
});

describe('draping 2D linework', () => {
  it('follows the ground and splits where the line leaves the surface', () => {
    const e = new Engine();
    const [ex] = e.load('existing.xml', existingXml);
    const y = 763490;
    const line = { points: Float64Array.from([410990, y, 0, 411100, y, 0]), closed: false };
    const [pieces] = e.drape([line], ex!.id, 1);
    expect(pieces).toHaveLength(1);
    const p = pieces![0]!;
    expect(p[0]).toBeCloseTo(411000, 0); // starts where the surface starts, not at 410990
    const els = e.elevations(p[3]!, p[4]!, [ex!.id]);
    expect(p[5]).toBeCloseTo(els[0]!.z, 6);
    expect(p.length / 3).toBeGreaterThan(90);
  });
});
