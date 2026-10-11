import { boundsOf, pointInPolygon, triAreaXY } from './geometry';
import type { TinIndex } from './tinIndex';
import type { Tin, Vec3 } from './types';

export interface VolumeResult {
  /** Material above the base (stockpile) or existing above design (to excavate), m³. */
  cut: number;
  /** Space below the base, or existing below design (to fill), m³. */
  fill: number;
  /** Plan area actually compared, m². */
  area: number;
}

/**
 * Exact volume between a TIN and a horizontal plane z = z0.
 *
 * Over one triangle the height above the plane, h = z - z0, is linear, so the
 * volume of the prism is (plan area) × (mean of the three corner heights).
 * Triangles that cross the plane are clipped along h = 0 first, so the parts
 * above and below are integrated separately rather than cancelling out.
 */
export function volumeAgainstPlane(tin: Tin, z0: number): VolumeResult {
  const p = tin.positions, t = tin.indices;
  let cut = 0, fill = 0, area = 0;
  for (let i = 0; i < t.length; i += 3) {
    const v = [t[i]! * 3, t[i + 1]! * 3, t[i + 2]! * 3].map((k) => [p[k]!, p[k + 1]!, p[k + 2]! - z0] as const);
    area += Math.abs(triAreaXY(v[0]![0], v[0]![1], v[1]![0], v[1]![1], v[2]![0], v[2]![1]));
    cut += integratePositive(v, 1);
    fill += integratePositive(v, -1);
  }
  return { cut, fill, area };
}

type P3 = readonly [number, number, number];

/** ∫ max(sign·h, 0) dA over a triangle with corner heights h. */
function integratePositive(tri: readonly P3[], sign: 1 | -1): number {
  // Sutherland-Hodgman: clip the triangle to the half-space sign·h >= 0.
  const poly: P3[] = [];
  for (let i = 0; i < 3; i++) {
    const a = tri[i]!, b = tri[(i + 1) % 3]!;
    const ha = sign * a[2], hb = sign * b[2];
    if (ha >= 0) poly.push(a);
    if (ha >= 0 !== hb >= 0) {
      const s = ha / (ha - hb);
      poly.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, 0]);
    }
  }
  let vol = 0;
  for (let i = 1; i + 1 < poly.length; i++) {
    const a = poly[0]!, b = poly[i]!, c = poly[i + 1]!;
    const area = Math.abs(triAreaXY(a[0], a[1], b[0], b[1], c[0], c[1]));
    vol += (area * sign * (a[2] + b[2] + c[2])) / 3;
  }
  return vol;
}

export interface GridVolumeOptions {
  /** Grid spacing, metres. Smaller is more accurate and slower (error falls roughly with cell²). */
  cell: number;
  /** Only count cells whose centre is inside this plan polygon. */
  boundary?: readonly Vec3[];
}

/**
 * Volume between a top surface and any base (a plane, or another TIN) by
 * sampling both on a regular grid. Cells where either surface has no data are
 * skipped and excluded from `area`. Used for stockpiles inside a drawn boundary
 * and for existing-vs-design cut/fill, where exact clipping would mean
 * intersecting two arbitrary TINs.
 */
export function gridVolume(top: TinIndex, base: (x: number, y: number) => number, opts: GridVolumeOptions): VolumeResult {
  const { cell, boundary } = opts;
  const b = boundary ? boundsOf(boundary.flatMap((q) => [q.x, q.y, q.z])) : top.bounds;
  const x0 = Math.max(b.minX, top.bounds.minX), x1 = Math.min(b.maxX, top.bounds.maxX);
  const y0 = Math.max(b.minY, top.bounds.minY), y1 = Math.min(b.maxY, top.bounds.maxY);
  const a = cell * cell;
  let cut = 0, fill = 0, area = 0;
  for (let y = y0 + cell / 2; y < y1; y += cell) {
    for (let x = x0 + cell / 2; x < x1; x += cell) {
      if (boundary && !pointInPolygon(x, y, boundary)) continue;
      const zt = top.zAt(x, y);
      if (Number.isNaN(zt)) continue;
      const zb = base(x, y);
      if (Number.isNaN(zb)) continue;
      const d = zt - zb;
      if (d > 0) cut += d * a;
      else fill -= d * a;
      area += a;
    }
  }
  return { cut, fill, area };
}

/** Per-vertex difference existing − design (NaN where the design has no data), for the cut/fill map. */
export function vertexDifference(existing: Tin, design: TinIndex): Float32Array {
  const p = existing.positions;
  const out = new Float32Array(p.length / 3);
  for (let i = 0; i < out.length; i++) out[i] = p[i * 3 + 2]! - design.zAt(p[i * 3]!, p[i * 3 + 1]!);
  return out;
}

/** Best-fit horizontal base for a stockpile: the mean surface elevation along its toe (boundary). */
export function toeElevation(boundary: readonly Vec3[], surface: TinIndex, step = 0.5): number {
  let sum = 0, n = 0;
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i]!, b = boundary[(i + 1) % boundary.length]!;
    const k = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let j = 0; j < k; j++) {
      const z = surface.zAt(a.x + ((b.x - a.x) * j) / k, a.y + ((b.y - a.y) * j) / k);
      if (!Number.isNaN(z)) { sum += z; n++; }
    }
  }
  return n ? sum / n : NaN;
}
