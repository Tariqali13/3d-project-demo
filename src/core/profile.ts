import type { TinIndex } from './tinIndex';
import type { Vec3 } from './types';

export interface Profile {
  /** Distance along the line from its start, metres. */
  chainage: Float64Array;
  /** Plan position of each sample (x, y pairs). */
  xy: Float64Array;
  /** Elevation per surface, NaN where that surface has no data. */
  series: { name: string; z: Float64Array }[];
  length: number;
}

/**
 * Sample one or more surfaces along a plan-view polyline. Every vertex of the
 * line is sampled exactly (so bends are never cut), plus intermediate points
 * every `step` metres.
 */
export function sampleProfile(line: readonly Vec3[], surfaces: { name: string; index: TinIndex }[], step = 0.5): Profile {
  const ch: number[] = [], xy: number[] = [];
  let run = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!, b = line[i + 1]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(seg / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      ch.push(run + seg * t);
      xy.push(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }
    run += seg;
  }
  const last = line[line.length - 1];
  if (last) {
    ch.push(run);
    xy.push(last.x, last.y);
  }
  const xyArr = Float64Array.from(xy);
  return {
    chainage: Float64Array.from(ch),
    xy: xyArr,
    length: run,
    series: surfaces.map(({ name, index }) => {
      const z = new Float64Array(ch.length);
      for (let i = 0; i < ch.length; i++) z[i] = index.zAt(xyArr[i * 2]!, xyArr[i * 2 + 1]!);
      return { name, z };
    }),
  };
}

/** Lowest and highest finite value across all series (for chart scaling). */
export function profileRange(p: Profile): { min: number; max: number } | null {
  let min = Infinity, max = -Infinity;
  for (const s of p.series) for (const z of s.z) if (Number.isFinite(z)) { if (z < min) min = z; if (z > max) max = z; }
  return Number.isFinite(min) ? { min, max } : null;
}
