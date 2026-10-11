import { boundsOf } from './geometry';
import type { Bounds, Tin } from './types';

/**
 * Uniform-grid index over a TIN's triangles in plan view, answering
 * "what is the surface elevation at (x, y)?" in roughly constant time.
 *
 * Profiles, volumes and cut/fill maps call this hundreds of thousands of times,
 * so it avoids per-query allocation: cells are stored in CSR form (one offsets
 * array, one flat triangle-id array) and the last hit triangle is checked first,
 * which makes sequential queries along a line or grid row nearly free.
 */
export class TinIndex {
  readonly bounds: Bounds;
  private readonly cell: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly offsets: Uint32Array;
  private readonly items: Uint32Array;
  private last = -1;

  constructor(readonly tin: Tin, targetPerCell = 4) {
    const { positions: p, indices: t } = tin;
    this.bounds = boundsOf(p);
    const triCount = t.length / 3;
    const w = Math.max(this.bounds.maxX - this.bounds.minX, 1e-9);
    const h = Math.max(this.bounds.maxY - this.bounds.minY, 1e-9);
    // Cell size so that, on average, a handful of triangles overlap each cell.
    this.cell = Math.max(Math.sqrt((w * h * targetPerCell) / Math.max(triCount, 1)), 1e-6);
    this.cols = Math.max(1, Math.ceil(w / this.cell));
    this.rows = Math.max(1, Math.ceil(h / this.cell));

    const nCells = this.cols * this.rows;
    const counts = new Uint32Array(nCells + 1);
    const forEachCell = (tri: number, fn: (c: number) => void) => {
      const a = t[tri * 3]! * 3, b = t[tri * 3 + 1]! * 3, c = t[tri * 3 + 2]! * 3;
      const x0 = Math.min(p[a]!, p[b]!, p[c]!), x1 = Math.max(p[a]!, p[b]!, p[c]!);
      const y0 = Math.min(p[a + 1]!, p[b + 1]!, p[c + 1]!), y1 = Math.max(p[a + 1]!, p[b + 1]!, p[c + 1]!);
      const c0 = this.col(x0), c1 = this.col(x1), r0 = this.row(y0), r1 = this.row(y1);
      for (let r = r0; r <= r1; r++) for (let cc = c0; cc <= c1; cc++) fn(r * this.cols + cc);
    };
    for (let tri = 0; tri < triCount; tri++) forEachCell(tri, (c) => counts[c + 1]!++);
    for (let i = 1; i <= nCells; i++) counts[i]! += counts[i - 1]!;
    this.offsets = counts;
    this.items = new Uint32Array(counts[nCells]!);
    const fill = counts.slice(0, nCells);
    for (let tri = 0; tri < triCount; tri++) forEachCell(tri, (c) => (this.items[fill[c]!++] = tri));
  }

  private col(x: number) {
    return Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.bounds.minX) / this.cell)));
  }
  private row(y: number) {
    return Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.bounds.minY) / this.cell)));
  }

  /** Elevation of the surface at (x, y), or NaN where the TIN does not cover the point. */
  zAt(x: number, y: number): number {
    const b = this.bounds;
    if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) return NaN;
    if (this.last >= 0) {
      const z = this.zInTriangle(this.last, x, y);
      if (!Number.isNaN(z)) return z;
    }
    const c = this.row(y) * this.cols + this.col(x);
    for (let i = this.offsets[c]!; i < this.offsets[c + 1]!; i++) {
      const tri = this.items[i]!;
      const z = this.zInTriangle(tri, x, y);
      if (!Number.isNaN(z)) {
        this.last = tri;
        return z;
      }
    }
    return NaN;
  }

  /** Barycentric interpolation; NaN when (x, y) is outside the triangle. */
  private zInTriangle(tri: number, x: number, y: number): number {
    const p = this.tin.positions, t = this.tin.indices;
    const a = t[tri * 3]! * 3, b = t[tri * 3 + 1]! * 3, c = t[tri * 3 + 2]! * 3;
    const ax = p[a]!, ay = p[a + 1]!, bx = p[b]!, by = p[b + 1]!, cx = p[c]!, cy = p[c + 1]!;
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) return NaN; // degenerate (vertical) triangle
    const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det;
    const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
    const l3 = 1 - l1 - l2;
    const eps = -1e-9;
    if (l1 < eps || l2 < eps || l3 < eps) return NaN;
    return l1 * p[a + 2]! + l2 * p[b + 2]! + l3 * p[c + 2]!;
  }
}
