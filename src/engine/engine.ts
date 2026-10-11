import { boundsOf, unionBounds } from '../core/geometry';
import { TinIndex } from '../core/tinIndex';
import { contourSegments, type Contours } from '../core/contours';
import { sampleProfile, type Profile } from '../core/profile';
import { gridVolume, toeElevation, vertexDifference, type VolumeResult } from '../core/volume';
import type { Bounds, Drawing, Tin, Vec3 } from '../core/types';
import { parseLandXml } from '../formats/landxml';
import { parseDxf } from '../formats/dxf';

export type FileKind = 'landxml' | 'dxf';

export function detectKind(name: string, text: string): FileKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.dxf')) return 'dxf';
  if (lower.endsWith('.xml') || lower.endsWith('.landxml')) return 'landxml';
  const head = text.slice(0, 2000);
  if (/<LandXML/i.test(head)) return 'landxml';
  if (/^\s*0\s*\r?\n\s*SECTION/m.test(head)) return 'dxf';
  return null;
}

export type LoadedDataset =
  | { kind: 'surface'; id: string; file: string; name: string; tin: Tin; bounds: Bounds }
  | { kind: 'drawing'; id: string; file: string; name: string; drawing: Drawing; bounds: Bounds; skipped: Record<string, number> };

export interface StockpileResult extends VolumeResult {
  baseZ: number;
  baseMode: 'toe' | 'fixed';
  /** Net volume above the base, m³. */
  volume: number;
}

export interface CutFillResult extends VolumeResult {
  /** Existing minus design at each existing vertex; NaN where the design has no data. */
  diff: Float32Array;
  /** Largest |difference| seen, for scaling the colour ramp. */
  range: number;
}

let nextId = 1;

/**
 * Holds parsed surfaces and their spatial indexes and answers analysis
 * questions about them. Runs inside a Web Worker in the app; plain class so the
 * tests can drive it directly.
 */
export class Engine {
  private readonly surfaces = new Map<string, { name: string; tin: Tin; index?: TinIndex }>();

  load(file: string, text: string): LoadedDataset[] {
    const kind = detectKind(file, text);
    if (!kind) throw new Error(`${file}: not a LandXML or DXF file. Groundwork reads LandXML 1.x surfaces and ASCII DXF drawings.`);
    const out: LoadedDataset[] = [];
    if (kind === 'landxml') {
      for (const tin of parseLandXml(text)) {
        if (tin.indices.length === 0) continue;
        const id = `s${nextId++}`;
        this.surfaces.set(id, { name: tin.name, tin });
        out.push({ kind: 'surface', id, file, name: tin.name, tin, bounds: boundsOf(tin.positions) });
      }
      if (!out.length) throw new Error(`${file}: the surfaces in this file have no triangles. Export the surface as a TIN with faces.`);
    } else {
      const d = parseDxf(text, stripExt(file));
      let bounds = boundsOf([]);
      for (const p of d.polylines) bounds = unionBounds(bounds, boundsOf(p.points));
      if (d.points.length) bounds = unionBounds(bounds, boundsOf(d.points.flatMap((p) => [p.x, p.y, p.z])));
      if (d.faces) bounds = unionBounds(bounds, boundsOf(d.faces.positions));
      if (!d.polylines.length && !d.points.length && !d.faces) throw new Error(`${file}: no supported entities found (lines, polylines, arcs, circles, points or 3D faces).`);
      const id = `d${nextId++}`;
      // 3D faces in a drawing are a surface too: you can measure and compute volumes on them.
      if (d.faces) this.surfaces.set(id, { name: d.name, tin: d.faces });
      out.push({ kind: 'drawing', id, file, name: d.name, drawing: d, bounds, skipped: d.skipped });
    }
    return out;
  }

  remove(id: string) {
    this.surfaces.delete(id);
  }

  private index(id: string): TinIndex {
    const s = this.surfaces.get(id);
    if (!s) throw new Error('That surface is no longer loaded.');
    s.index ??= new TinIndex(s.tin);
    return s.index;
  }

  /** Elevation of every requested surface at a plan position (NaN where a surface has no data). */
  elevations(x: number, y: number, ids: string[]): { id: string; name: string; z: number }[] {
    return ids.filter((id) => this.surfaces.has(id)).map((id) => ({ id, name: this.surfaces.get(id)!.name, z: this.index(id).zAt(x, y) }));
  }

  /**
   * Lay 2D linework (drawn at z = 0, as most site plans are) onto a surface.
   * Lines are densified so they follow the ground between vertices, and split
   * where they leave the surface rather than diving to z = 0.
   */
  drape(lines: { points: Float64Array; closed: boolean }[], surfaceId: string, step = 1): Float64Array[][] {
    const idx = this.index(surfaceId);
    return lines.map(({ points: p, closed }) => {
      const n = p.length / 3;
      const pieces: Float64Array[] = [];
      let cur: number[] = [];
      const flush = () => {
        if (cur.length >= 6) pieces.push(Float64Array.from(cur));
        cur = [];
      };
      const visit = (x: number, y: number) => {
        const z = idx.zAt(x, y);
        if (Number.isNaN(z)) flush();
        else cur.push(x, y, z);
      };
      const segs = closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const ax = p[i * 3]!, ay = p[i * 3 + 1]!;
        const j = (i + 1) % n;
        const bx = p[j * 3]!, by = p[j * 3 + 1]!;
        const len = Math.hypot(bx - ax, by - ay);
        const k = Math.max(1, Math.ceil(len / step));
        for (let s = i === 0 ? 0 : 1; s <= k; s++) visit(ax + ((bx - ax) * s) / k, ay + ((by - ay) * s) / k);
      }
      flush();
      return pieces;
    });
  }

  contours(id: string, interval: number): Contours {
    const s = this.surfaces.get(id);
    if (!s) throw new Error('That surface is no longer loaded.');
    return contourSegments(s.tin, interval);
  }

  profile(line: Vec3[], ids: string[], step?: number): Profile {
    const surfaces = ids.map((id) => ({ name: this.surfaces.get(id)?.name ?? id, index: this.index(id) }));
    const len = line.reduce((acc, p, i) => (i ? acc + Math.hypot(p.x - line[i - 1]!.x, p.y - line[i - 1]!.y) : 0), 0);
    // Keep the chart to a few thousand samples however long the line is.
    return sampleProfile(line, surfaces, step ?? Math.max(0.25, len / 2000));
  }

  stockpile(id: string, boundary: Vec3[], base: { mode: 'toe' } | { mode: 'fixed'; z: number }): StockpileResult {
    if (boundary.length < 3) throw new Error('Draw at least three points around the stockpile.');
    const top = this.index(id);
    const baseZ = base.mode === 'toe' ? toeElevation(boundary, top) : base.z;
    if (!Number.isFinite(baseZ)) throw new Error('The boundary is outside the surface, so there is no ground level to measure from.');
    const r = gridVolume(top, () => baseZ, { cell: autoCell(boundary), boundary });
    return { ...r, baseZ, baseMode: base.mode, volume: r.cut - r.fill };
  }

  cutFill(existingId: string, designId: string): CutFillResult {
    const existing = this.index(existingId);
    const design = this.index(designId);
    const b = design.bounds;
    const area = (b.maxX - b.minX) * (b.maxY - b.minY);
    // ~250k samples: sub-metre on a typical pad, fast enough to feel instant.
    const cell = Math.max(0.1, Math.sqrt(area / 250_000));
    const r = gridVolume(existing, (x, y) => design.zAt(x, y), { cell });
    const diff = vertexDifference(existing.tin, design);
    let range = 0;
    for (const d of diff) if (Number.isFinite(d) && Math.abs(d) > range) range = Math.abs(d);
    return { ...r, diff, range };
  }
}

function autoCell(boundary: Vec3[]): number {
  const b = boundsOf(boundary.flatMap((p) => [p.x, p.y, p.z]));
  return Math.max(0.05, Math.sqrt(((b.maxX - b.minX) * (b.maxY - b.minY)) / 200_000));
}

function stripExt(f: string) {
  return f.replace(/\.[^.]+$/, '');
}
