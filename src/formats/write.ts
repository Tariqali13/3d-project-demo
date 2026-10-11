import type { Polyline, PointFeature, Tin } from '../core/types';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3));

/** LandXML 1.2 with one TIN surface. Points are written "northing easting elevation". */
export function writeLandXml(tin: Tin, opts: { units?: 'metric'; description?: string } = {}): string {
  const p = tin.positions;
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2">');
  lines.push('  <Units><Metric linearUnit="meter" areaUnit="squareMeter" volumeUnit="cubicMeter"/></Units>');
  lines.push('  <Surfaces>');
  lines.push(`    <Surface name="${escapeXml(tin.name)}"${opts.description ? ` desc="${escapeXml(opts.description)}"` : ''}>`);
  lines.push('      <Definition surfType="TIN">');
  lines.push('        <Pnts>');
  for (let i = 0; i < p.length / 3; i++) lines.push(`          <P id="${i + 1}">${fmt(p[i * 3 + 1]!)} ${fmt(p[i * 3]!)} ${fmt(p[i * 3 + 2]!)}</P>`);
  lines.push('        </Pnts>');
  lines.push('        <Faces>');
  const f = tin.indices;
  for (let i = 0; i < f.length; i += 3) lines.push(`          <F>${f[i]! + 1} ${f[i + 1]! + 1} ${f[i + 2]! + 1}</F>`);
  lines.push('        </Faces>');
  lines.push('      </Definition>');
  lines.push('    </Surface>');
  lines.push('  </Surfaces>');
  lines.push('</LandXML>');
  return lines.join('\n') + '\n';
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
}

export interface DxfContent {
  polylines?: (Polyline & { bulges?: number[] })[];
  points?: PointFeature[];
  text?: { layer: string; x: number; y: number; height: number; value: string }[];
  /** Layer colours (ACI). */
  layerColors?: Record<string, number>;
}

/**
 * Minimal ASCII DXF (AC1009 / R12-compatible entities). Flat polylines with a
 * constant elevation are written as LWPOLYLINE; polylines whose vertices vary in
 * z are written as 3D POLYLINE so elevations survive the round trip.
 */
export function writeDxf(c: DxfContent): string {
  const out: (string | number)[] = [];
  const g = (code: number, v: string | number) => out.push(code, typeof v === 'number' ? fmt(v) : v);

  const layers = new Set<string>(Object.keys(c.layerColors ?? {}));
  for (const p of c.polylines ?? []) layers.add(p.layer);
  for (const p of c.points ?? []) layers.add(p.layer);
  for (const t of c.text ?? []) layers.add(t.layer);

  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.size);
  for (const l of [...layers].sort()) {
    g(0, 'LAYER'); g(2, l); g(70, 0); g(62, c.layerColors?.[l] ?? 7); g(6, 'CONTINUOUS');
  }
  g(0, 'ENDTAB'); g(0, 'ENDSEC');

  g(0, 'SECTION'); g(2, 'ENTITIES');
  for (const pl of c.polylines ?? []) {
    const p = pl.points;
    const n = p.length / 3;
    let flat = true;
    for (let i = 1; i < n; i++) if (p[i * 3 + 2] !== p[2]) flat = false;
    if (flat) {
      g(0, 'LWPOLYLINE'); g(8, pl.layer); g(90, n); g(70, pl.closed ? 1 : 0); g(38, p[2] ?? 0);
      for (let i = 0; i < n; i++) {
        g(10, p[i * 3]!); g(20, p[i * 3 + 1]!);
        const b = pl.bulges?.[i];
        if (b) g(42, b.toPrecision(12));
      }
    } else {
      g(0, 'POLYLINE'); g(8, pl.layer); g(66, 1); g(70, 8 | (pl.closed ? 1 : 0));
      for (let i = 0; i < n; i++) {
        g(0, 'VERTEX'); g(8, pl.layer); g(10, p[i * 3]!); g(20, p[i * 3 + 1]!); g(30, p[i * 3 + 2]!); g(70, 32);
      }
      g(0, 'SEQEND'); g(8, pl.layer);
    }
  }
  for (const pt of c.points ?? []) {
    g(0, 'POINT'); g(8, pt.layer); g(10, pt.x); g(20, pt.y); g(30, pt.z);
  }
  for (const t of c.text ?? []) {
    g(0, 'TEXT'); g(8, t.layer); g(10, t.x); g(20, t.y); g(30, 0); g(40, t.height); g(1, t.value);
  }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return out.join('\n') + '\n';
}
