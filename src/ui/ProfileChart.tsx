import { useCallback, useMemo, useRef, useState } from 'react';
import type { Profile } from '../core/profile';
import { profileRange } from '../core/profile';
import { cut as cutColor, fill as fillColor, seriesColors } from '../viewer/palette';
import { grouped, niceTicks } from './format';

interface Props {
  profile: Profile;
  /** Called with the sample index under the pointer, or null. */
  onHover: (i: number | null) => void;
}

const M = { top: 14, right: 18, bottom: 26, left: 52 };

/**
 * Long section along the drawn line. With two surfaces the band between them
 * is shaded red where the first (existing) is above the second (design): cut;
 * green where it is below: fill.
 */
export function ProfileChart({ profile, onHover }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 180 });
  const [hover, setHover] = useState<number | null>(null);

  const measure = useCallback((el: SVGSVGElement | null) => {
    ref.current = el;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - r.width) > 1 || Math.abs(s.h - r.height) > 1 ? { w: r.width, h: r.height } : s));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geom = useMemo(() => {
    const range = profileRange(profile) ?? { min: 0, max: 1 };
    const pad = Math.max((range.max - range.min) * 0.12, 0.5);
    const zMin = range.min - pad, zMax = range.max + pad;
    const iw = Math.max(size.w - M.left - M.right, 10), ih = Math.max(size.h - M.top - M.bottom, 10);
    const sx = (c: number) => M.left + (c / Math.max(profile.length, 1e-9)) * iw;
    const sy = (z: number) => M.top + (1 - (z - zMin) / (zMax - zMin)) * ih;
    const paths = profile.series.map((s) => {
      let d = '', pen = false;
      for (let i = 0; i < s.z.length; i++) {
        const z = s.z[i]!;
        if (Number.isNaN(z)) { pen = false; continue; }
        d += `${pen ? 'L' : 'M'}${sx(profile.chainage[i]!).toFixed(1)},${sy(z).toFixed(1)}`;
        pen = true;
      }
      return d;
    });
    // Cut/fill bands between the first two series, one polygon per run of same sign.
    const bands: { d: string; sign: 1 | -1 }[] = [];
    const a = profile.series[0]?.z, b = profile.series[1]?.z;
    if (a && b) {
      let run: number[] = [], sign: 1 | -1 = 1;
      const close = () => {
        if (run.length > 1) {
          const top = run.map((i) => `${sx(profile.chainage[i]!).toFixed(1)},${sy(a[i]!).toFixed(1)}`);
          const bot = [...run].reverse().map((i) => `${sx(profile.chainage[i]!).toFixed(1)},${sy(b[i]!).toFixed(1)}`);
          bands.push({ d: `M${top.join('L')}L${bot.join('L')}Z`, sign });
        }
        run = [];
      };
      for (let i = 0; i < a.length; i++) {
        const za = a[i]!, zb = b[i]!;
        if (Number.isNaN(za) || Number.isNaN(zb)) { close(); continue; }
        const s: 1 | -1 = za >= zb ? 1 : -1;
        if (run.length && s !== sign) { run.push(i); close(); }
        sign = s;
        run.push(i);
      }
      close();
    }
    return { sx, sy, zMin, zMax, paths, bands, iw, ih };
  }, [profile, size]);

  const xTicks = niceTicks(0, profile.length, Math.max(2, Math.floor(geom.iw / 90)));
  const yTicks = niceTicks(geom.zMin, geom.zMax, Math.max(2, Math.floor(geom.ih / 36)));

  const move = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const c = ((e.clientX - r.left - M.left) / geom.iw) * profile.length;
    if (c < 0 || c > profile.length) return leave();
    // Chainage is sorted: binary search for the nearest sample.
    let lo = 0, hi = profile.chainage.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (profile.chainage[mid]! < c) lo = mid;
      else hi = mid;
    }
    const i = c - profile.chainage[lo]! < profile.chainage[hi]! - c ? lo : hi;
    setHover(i);
    onHover(i);
  };
  const leave = () => {
    setHover(null);
    onHover(null);
  };

  const hx = hover === null ? null : geom.sx(profile.chainage[hover]!);

  return (
    <div className="chart">
      <svg ref={measure} className="chart-svg" onPointerMove={move} onPointerLeave={leave} role="img" aria-label="Long section along the drawn line">
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={M.left} x2={M.left + geom.iw} y1={geom.sy(t)} y2={geom.sy(t)} className="grid" />
            <text x={M.left - 8} y={geom.sy(t)} className="tick" textAnchor="end" dominantBaseline="middle">{t.toFixed(t % 1 ? 1 : 0)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line x1={geom.sx(t)} x2={geom.sx(t)} y1={M.top} y2={M.top + geom.ih} className="grid" />
            <text x={geom.sx(t)} y={M.top + geom.ih + 17} className="tick" textAnchor="middle">{grouped(t, t % 1 ? 1 : 0)}</text>
          </g>
        ))}
        {geom.bands.map((b, i) => (
          <path key={i} d={b.d} fill={b.sign > 0 ? cutColor : fillColor} fillOpacity={0.28} />
        ))}
        {geom.paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={seriesColors[i % seriesColors.length]} strokeWidth={i === 0 ? 1.75 : 1.5} strokeDasharray={i === 0 ? undefined : '6 3'} />
        ))}
        {hx !== null && hover !== null && (
          <g>
            <line x1={hx} x2={hx} y1={M.top} y2={M.top + geom.ih} className="cursor" />
            {profile.series.map((s, i) =>
              Number.isNaN(s.z[hover]!) ? null : <circle key={i} cx={hx} cy={geom.sy(s.z[hover]!)} r={3.5} fill={seriesColors[i % seriesColors.length]} />,
            )}
          </g>
        )}
      </svg>
      <div className="chart-readout" aria-live="polite">
        {hover === null ? (
          <span className="muted">Point at the section to read chainage and levels.</span>
        ) : (
          <>
            <span>Ch {grouped(profile.chainage[hover]!, 2)}</span>
            {profile.series.map((s, i) => (
              <span key={i}>
                <i className="swatch-line" style={{ background: seriesColors[i % seriesColors.length] }} />
                {s.name.split(' (')[0]} {Number.isNaN(s.z[hover]!) ? 'no data' : s.z[hover]!.toFixed(3)}
              </span>
            ))}
            {profile.series.length >= 2 && !Number.isNaN(profile.series[0]!.z[hover]!) && !Number.isNaN(profile.series[1]!.z[hover]!) && (
              <span className={profile.series[0]!.z[hover]! >= profile.series[1]!.z[hover]! ? 'is-cut' : 'is-fill'}>
                {profile.series[0]!.z[hover]! >= profile.series[1]!.z[hover]! ? 'Cut' : 'Fill'} {Math.abs(profile.series[0]!.z[hover]! - profile.series[1]!.z[hover]!).toFixed(3)}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function profileCsv(p: Profile): string {
  const head = ['chainage_m', 'easting', 'northing', ...p.series.map((s) => s.name.replace(/[",]/g, ' '))];
  const rows = [head.join(',')];
  for (let i = 0; i < p.chainage.length; i++) {
    rows.push([p.chainage[i]!.toFixed(3), p.xy[i * 2]!.toFixed(3), p.xy[i * 2 + 1]!.toFixed(3), ...p.series.map((s) => (Number.isNaN(s.z[i]!) ? '' : s.z[i]!.toFixed(3)))].join(','));
  }
  return rows.join('\n') + '\n';
}
