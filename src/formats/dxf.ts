import DxfParser from 'dxf-parser';
import type { Drawing, Polyline, PointFeature } from '../core/types';

type V = { x: number; y: number; z?: number; bulge?: number };
interface Entity {
  type: string;
  layer?: string;
  vertices?: V[];
  position?: V;
  center?: V;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  elevation?: number;
  shape?: boolean;
  isPolyfaceMesh?: boolean;
  is3dPolygonMesh?: boolean;
}

/** Max angle per tessellated arc segment. */
const ARC_STEP = Math.PI / 32;

/**
 * Arc between two polyline vertices from a DXF "bulge" (tan of a quarter of the
 * included angle; positive = counter-clockwise). Returns intermediate points only.
 */
export function bulgeArc(a: V, b: V, bulge: number, z: number): number[] {
  const theta = 4 * Math.atan(bulge);
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  if (chord < 1e-12 || Math.abs(theta) < 1e-9) return [];
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
  // Centre: from the chord midpoint, along the chord normal by the sagitta-complement.
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const d = Math.sqrt(Math.max(r * r - (chord / 2) ** 2, 0));
  const nx = -(b.y - a.y) / chord, ny = (b.x - a.x) / chord;
  const side = (bulge > 0 ? 1 : -1) * (Math.abs(theta) > Math.PI ? -1 : 1);
  const cx = mx + nx * d * side, cy = my + ny * d * side;
  const start = Math.atan2(a.y - cy, a.x - cx);
  const steps = Math.max(2, Math.ceil(Math.abs(theta) / ARC_STEP));
  const out: number[] = [];
  for (let i = 1; i < steps; i++) {
    const t = start + (theta * i) / steps;
    out.push(cx + r * Math.cos(t), cy + r * Math.sin(t), z);
  }
  return out;
}

function arcPoints(c: V, r: number, start: number, end: number): number[] {
  let sweep = end - start;
  if (sweep <= 0) sweep += Math.PI * 2;
  const steps = Math.max(8, Math.ceil(sweep / ARC_STEP));
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = start + (sweep * i) / steps;
    out.push(c.x + r * Math.cos(t), c.y + r * Math.sin(t), c.z ?? 0);
  }
  return out;
}

/**
 * Normalise a DXF's model-space entities into polylines, points and 3D faces.
 * Supported: LINE, LWPOLYLINE (with bulges and elevation), POLYLINE (2D/3D),
 * ARC, CIRCLE, POINT, 3DFACE. Blocks, text, hatches and paper space are ignored
 * and counted in `skipped` so the UI can say so.
 */
export function parseDxf(text: string, name = 'Drawing'): Drawing & { skipped: Record<string, number> } {
  const parsed = new DxfParser().parseSync(text) as { entities?: Entity[] } | null;
  if (!parsed?.entities) throw new Error('Could not read this DXF. Save it as ASCII DXF (R12 or later) and try again.');
  const polylines: Polyline[] = [];
  const points: PointFeature[] = [];
  const faceXYZ: number[] = [];
  const faceIdx: number[] = [];
  const layers = new Set<string>();
  const skipped: Record<string, number> = {};

  const addLine = (layer: string, xyz: number[], closed: boolean) => {
    if (xyz.length >= 6) polylines.push({ layer, points: Float64Array.from(xyz), closed });
  };

  for (const e of parsed.entities) {
    const layer = e.layer ?? '0';
    switch (e.type) {
      case 'LINE': {
        const [a, b] = e.vertices ?? [];
        if (a && b) addLine(layer, [a.x, a.y, a.z ?? 0, b.x, b.y, b.z ?? 0], false);
        break;
      }
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        if (e.isPolyfaceMesh || e.is3dPolygonMesh) { skipped[`${e.type} mesh`] = (skipped[`${e.type} mesh`] ?? 0) + 1; continue; }
        const vs = e.vertices ?? [];
        const xyz: number[] = [];
        for (let i = 0; i < vs.length; i++) {
          const v = vs[i]!;
          const z = v.z ?? e.elevation ?? 0;
          xyz.push(v.x, v.y, z);
          const next = vs[i + 1] ?? (e.shape ? vs[0] : undefined);
          if (v.bulge && next) xyz.push(...bulgeArc(v, next, v.bulge, z));
        }
        addLine(layer, xyz, !!e.shape);
        break;
      }
      case 'ARC':
        if (e.center && e.radius) addLine(layer, arcPoints(e.center, e.radius, e.startAngle ?? 0, e.endAngle ?? Math.PI * 2), false);
        break;
      case 'CIRCLE':
        if (e.center && e.radius) addLine(layer, arcPoints(e.center, e.radius, 0, Math.PI * 2), true);
        break;
      case 'POINT':
        if (e.position) points.push({ layer, x: e.position.x, y: e.position.y, z: e.position.z ?? 0 });
        break;
      case '3DFACE': {
        const vs = (e.vertices ?? []).filter((v) => v.x !== undefined);
        if (vs.length < 3) break;
        const base = faceXYZ.length / 3;
        for (const v of vs) faceXYZ.push(v.x, v.y, v.z ?? 0);
        faceIdx.push(base, base + 1, base + 2);
        const d = vs[3];
        const c = vs[2]!;
        if (d && (d.x !== c.x || d.y !== c.y || (d.z ?? 0) !== (c.z ?? 0))) faceIdx.push(base, base + 2, base + 3);
        break;
      }
      default:
        skipped[e.type] = (skipped[e.type] ?? 0) + 1;
        continue;
    }
    layers.add(layer);
  }

  return {
    name,
    polylines,
    points,
    faces: faceIdx.length ? { name: `${name} faces`, positions: Float64Array.from(faceXYZ), indices: Uint32Array.from(faceIdx) } : null,
    layers: [...layers].sort(),
    skipped,
  };
}
