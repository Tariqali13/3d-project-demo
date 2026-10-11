import type { Tin } from '../src/core/types';

/** Regular grid TIN over [x0, x0+w] × [y0, y0+h] with z = f(x, y). */
export function gridTin(f: (x: number, y: number) => number, opts: { x0?: number; y0?: number; w: number; h: number; n: number }): Tin {
  const { x0 = 0, y0 = 0, w, h, n } = opts;
  const pos: number[] = [];
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const x = x0 + (w * i) / n, y = y0 + (h * j) / n;
      pos.push(x, y, f(x, y));
    }
  const idx: number[] = [];
  const at = (i: number, j: number) => j * (n + 1) + i;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) idx.push(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i, j + 1));
  return { name: 'grid', positions: Float64Array.from(pos), indices: Uint32Array.from(idx) };
}
