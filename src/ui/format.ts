const THIN = ' ';

/** 763528.271 → "763 528.271" (thin-space grouping, as on survey drawings). */
export function grouped(v: number, decimals = 3): string {
  if (!Number.isFinite(v)) return '—';
  const [int, frac] = Math.abs(v).toFixed(decimals).split('.');
  const g = int!.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
  return (v < 0 ? '−' : '') + g + (frac ? '.' + frac : '');
}

export const metres = (v: number, d = 2) => `${grouped(v, d)} m`;
export const sqm = (v: number) => `${grouped(v, v < 100 ? 2 : 1)} m²`;
export const cum = (v: number) => `${grouped(v, v < 100 ? 2 : 0)} m³`;
export const elev = (v: number) => (Number.isFinite(v) ? `${v.toFixed(3)} m` : 'no data');
export const pct = (v: number | null) => (v === null ? 'vertical' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} %`);

/** Whole-circle bearing as degrees, minutes, seconds. */
export function dms(deg: number): string {
  let d = Math.floor(deg);
  let m = Math.floor((deg - d) * 60);
  let s = Math.round(((deg - d) * 60 - m) * 60);
  if (s === 60) { s = 0; m++; }
  if (m === 60) { m = 0; d++; }
  return `${d % 360}° ${String(m).padStart(2, '0')}′ ${String(s).padStart(2, '0')}″`;
}

/** A round scale-bar length (1, 2 or 5 × 10ⁿ metres) close to `target`. */
export function niceLength(target: number): number {
  const p = 10 ** Math.floor(Math.log10(target));
  const n = target / p;
  return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * p;
}

/** Tick values for a chart axis. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const step = niceLength((max - min) / count);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}
