import type { Tin } from './types';

export interface Contours {
  /** Line segments as x, y, z, x, y, z per segment (world coordinates). */
  segments: Float64Array;
  /** Contour level of each segment. */
  levels: Float64Array;
  interval: number;
}

/**
 * Contours by marching triangles: each triangle is linear, so where a level
 * crosses it the contour is a single straight segment between two edges.
 * Works on any TIN, no regridding.
 */
export function contourSegments(tin: Tin, interval: number): Contours {
  const p = tin.positions, t = tin.indices;
  const segs: number[] = [], levels: number[] = [];
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i]! * 3, b = t[i + 1]! * 3, c = t[i + 2]! * 3;
    const za = p[a + 2]!, zb = p[b + 2]!, zc = p[c + 2]!;
    const lo = Math.min(za, zb, zc), hi = Math.max(za, zb, zc);
    for (let z = Math.ceil(lo / interval) * interval; z <= hi; z += interval) {
      if (z === lo || z === hi) continue; // touching a vertex only: no crossing segment
      const pts: number[] = [];
      for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
        const zu = p[u + 2]!, zv = p[v + 2]!;
        if ((zu < z) !== (zv < z)) {
          const s = (z - zu) / (zv - zu);
          pts.push(p[u]! + (p[v]! - p[u]!) * s, p[u + 1]! + (p[v + 1]! - p[u + 1]!) * s, z);
        }
      }
      if (pts.length === 6) {
        segs.push(...pts);
        levels.push(z);
      }
    }
  }
  return { segments: Float64Array.from(segs), levels: Float64Array.from(levels), interval };
}

/**
 * Join contour segments that share endpoints into polylines (for display and
 * DXF export). Points are x, y, z with z = the contour level.
 */
export function chainSegments(c: Contours, tolerance = 1e-6): { level: number; points: number[] }[] {
  const key = (x: number, y: number) => `${Math.round(x / tolerance)},${Math.round(y / tolerance)}`;
  const byLevel = new Map<number, number[]>();
  for (let i = 0; i < c.levels.length; i++) {
    const list = byLevel.get(c.levels[i]!) ?? [];
    list.push(i);
    byLevel.set(c.levels[i]!, list);
  }
  const s = c.segments;
  const out: { level: number; points: number[] }[] = [];
  for (const [level, ids] of byLevel) {
    const ends = new Map<string, number[]>();
    for (const id of ids) {
      for (const k of [key(s[id * 6]!, s[id * 6 + 1]!), key(s[id * 6 + 3]!, s[id * 6 + 4]!)]) {
        const l = ends.get(k) ?? [];
        l.push(id);
        ends.set(k, l);
      }
    }
    const used = new Set<number>();
    // Walk from an end point, appending the far end of each unused segment that touches it.
    const walk = (x: number, y: number, into: number[]) => {
      for (;;) {
        const next = (ends.get(key(x, y)) ?? []).find((n) => !used.has(n));
        if (next === undefined) return;
        used.add(next);
        const startsHere = key(s[next * 6]!, s[next * 6 + 1]!) === key(x, y);
        x = startsHere ? s[next * 6 + 3]! : s[next * 6]!;
        y = startsHere ? s[next * 6 + 4]! : s[next * 6 + 1]!;
        into.push(x, y);
      }
    };
    for (const start of ids) {
      if (used.has(start)) continue;
      used.add(start);
      const fwd: number[] = [], back: number[] = [];
      walk(s[start * 6 + 3]!, s[start * 6 + 4]!, fwd);
      walk(s[start * 6]!, s[start * 6 + 1]!, back);
      const xy: number[] = [];
      for (let i = back.length - 2; i >= 0; i -= 2) xy.push(back[i]!, back[i + 1]!);
      xy.push(s[start * 6]!, s[start * 6 + 1]!, s[start * 6 + 3]!, s[start * 6 + 4]!, ...fwd);
      const points: number[] = [];
      for (let i = 0; i < xy.length; i += 2) points.push(xy[i]!, xy[i + 1]!, level);
      out.push({ level, points });
    }
  }
  return out;
}
