import type { Polyline, PointFeature, Tin, Vec3 } from './types';
import { TinIndex } from './tinIndex';
import { contourSegments, chainSegments } from './contours';

/**
 * A synthetic but plausible site, generated deterministically so the demo data
 * is reproducible and owned by the project (no client data anywhere).
 *
 * Coordinates are projected metres around E 411 000, N 763 400 so the float64 →
 * local-origin path is exercised exactly as it would be with real survey data.
 */
export const SITE = { x0: 411000, y0: 763400, w: 240, h: 180 };
export const STOCKPILE = { x: 411178, y: 763528, radius: 15, height: 7.5, topRadius: 3 };
export const PAD = { x0: 411060, y0: 763440, w: 70, h: 45, z: 86.0 };
/** Batter slope (horizontal per 1 vertical) on the pad cut/fill faces. */
export const BATTER = 2;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise on a lattice, for gentle irregularity in the ground. */
function valueNoise(seed: number, cell: number) {
  const rnd = mulberry32(seed);
  const size = 64;
  const lattice = Float64Array.from({ length: size * size }, () => rnd() * 2 - 1);
  const at = (i: number, j: number) => lattice[((j % size) + size) % size * size + (((i % size) + size) % size)]!;
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const fx = x / cell, fy = y / cell;
    const i = Math.floor(fx), j = Math.floor(fy);
    const u = s(fx - i), v = s(fy - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * u;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
    return a + (b - a) * v;
  };
}

/** Existing ground elevation in metres, before the stockpile. */
export function groundZ(): (x: number, y: number) => number {
  const n1 = valueNoise(7, 38);
  const n2 = valueNoise(11, 13);
  return (X, Y) => {
    const x = X - SITE.x0, y = Y - SITE.y0;
    // Regional fall to the south-west, a low knoll in the north, a gully draining west.
    const regional = 82 + 0.028 * x + 0.035 * y;
    const knoll = 4.2 * Math.exp(-(((x - 95) / 55) ** 2 + ((y - 150) / 38) ** 2));
    const gullyLine = 40 + 0.18 * x + 9 * Math.sin(x / 31);
    const gully = -2.6 * Math.exp(-(((y - gullyLine) / 9) ** 2)) * Math.min(1, (240 - x) / 120);
    return regional + knoll + gully + 1.1 * n1(x, y) + 0.25 * n2(x, y);
  };
}

function stockpileHeight(X: number, Y: number): number {
  const r = Math.hypot(X - STOCKPILE.x, Y - STOCKPILE.y);
  if (r >= STOCKPILE.radius) return 0;
  if (r <= STOCKPILE.topRadius) return STOCKPILE.height;
  const t = (STOCKPILE.radius - r) / (STOCKPILE.radius - STOCKPILE.topRadius);
  // Slightly convex shoulders, like a pile pushed up by a loader.
  return STOCKPILE.height * Math.sin((t * Math.PI) / 2) ** 1.25;
}

/**
 * Jittered-grid TIN. Each cell is split along whichever diagonal is shorter in
 * 3D, the way a surveyor's TIN would favour breaklines over flat diagonals.
 */
export function makeTin(name: string, f: (x: number, y: number) => number, area: { x0: number; y0: number; w: number; h: number }, spacing: number, seed: number, jitter = 0.28): Tin {
  const rnd = mulberry32(seed);
  const nx = Math.round(area.w / spacing), ny = Math.round(area.h / spacing);
  const pos = new Float64Array((nx + 1) * (ny + 1) * 3);
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      const edge = i === 0 || j === 0 || i === nx || j === ny;
      const x = area.x0 + i * spacing + (edge ? 0 : (rnd() - 0.5) * spacing * jitter);
      const y = area.y0 + j * spacing + (edge ? 0 : (rnd() - 0.5) * spacing * jitter);
      const k = (j * (nx + 1) + i) * 3;
      pos[k] = Math.round(x * 1000) / 1000;
      pos[k + 1] = Math.round(y * 1000) / 1000;
      pos[k + 2] = Math.round(f(x, y) * 1000) / 1000;
    }
  const at = (i: number, j: number) => j * (nx + 1) + i;
  const d3 = (a: number, b: number) => Math.hypot(pos[a * 3]! - pos[b * 3]!, pos[a * 3 + 1]! - pos[b * 3 + 1]!, pos[a * 3 + 2]! - pos[b * 3 + 2]!);
  const idx: number[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      if (d3(a, c) <= d3(b, d)) idx.push(a, b, c, a, c, d);
      else idx.push(a, b, d, b, c, d);
    }
  return { name, positions: pos, indices: Uint32Array.from(idx) };
}

export interface SampleSite {
  existing: Tin;
  design: Tin;
  boundary: Vec3[];
  padOutline: Vec3[];
  stockpileToe: Vec3[];
  road: { points: Vec3[]; bulges: number[] };
  contours: Polyline[];
  control: PointFeature[];
}

export function generateSite(spacing = 2): SampleSite {
  const ground = groundZ();
  const surveyed = (x: number, y: number) => ground(x, y) + stockpileHeight(x, y);
  const existing = makeTin('Existing ground (survey 2026-09-14)', surveyed, SITE, spacing, 42);
  const existingIdx = new TinIndex(existing);

  // Design: flat pad, with batters at 1:BATTER that daylight into existing ground.
  const margin = 18;
  const area = { x0: PAD.x0 - margin, y0: PAD.y0 - margin, w: PAD.w + 2 * margin, h: PAD.h + 2 * margin };
  const designZ = (x: number, y: number) => {
    const dx = Math.max(PAD.x0 - x, 0, x - (PAD.x0 + PAD.w));
    const dy = Math.max(PAD.y0 - y, 0, y - (PAD.y0 + PAD.h));
    const d = Math.hypot(dx, dy);
    const g = ground(x, y);
    const reach = d / BATTER;
    return PAD.z + Math.max(-reach, Math.min(reach, g - PAD.z));
  };
  const design = makeTin('Building pad design rev C', designZ, area, 1.5, 9, 0);

  const box = (x0: number, y0: number, w: number, h: number, z: number): Vec3[] => [
    { x: x0, y: y0, z }, { x: x0 + w, y: y0, z }, { x: x0 + w, y: y0 + h, z }, { x: x0, y: y0 + h, z },
  ];

  const toe: Vec3[] = [];
  const toeR = STOCKPILE.radius + 1.5;
  for (let i = 0; i < 24; i++) {
    const t = (i / 24) * Math.PI * 2;
    const r = toeR * (1 + 0.06 * Math.sin(3 * t + 0.7));
    const x = STOCKPILE.x + r * Math.cos(t), y = STOCKPILE.y + r * Math.sin(t);
    toe.push({ x: round3(x), y: round3(y), z: round3(existingIdx.zAt(x, y)) });
  }

  // Access road centreline: tangent – curve – tangent, the curve as a DXF bulge.
  const roadPts: Vec3[] = [
    { x: 411000, y: 763462, z: 0 },
    { x: 411030, y: 763462, z: 0 },
    { x: 411048, y: 763480, z: 0 },
    { x: 411048, y: 763560, z: 0 },
  ];
  const roadBulges = [0, Math.tan(Math.PI / 2 / 4), 0, 0];

  const c = contourSegments(existing, 1);
  const contours: Polyline[] = chainSegments(c, 1e-6).map((ch) => ({
    layer: ch.level % 5 === 0 ? 'C-TOPO-MAJR' : 'C-TOPO-MINR',
    points: Float64Array.from(ch.points.map((v, i) => (i % 3 === 2 ? v : round3(v)))),
    closed: false,
  }));

  const control: PointFeature[] = [
    [411012.214, 763411.906],
    [411228.507, 763418.33],
    [411221.18, 763571.452],
    [411019.775, 763566.09],
  ].map(([x, y]) => ({ layer: 'V-CTRL', x: x!, y: y!, z: round3(existingIdx.zAt(x!, y!)) }));

  return {
    existing,
    design,
    boundary: box(SITE.x0 + 4, SITE.y0 + 4, SITE.w - 8, SITE.h - 8, 0),
    padOutline: box(PAD.x0, PAD.y0, PAD.w, PAD.h, PAD.z),
    stockpileToe: toe,
    road: { points: roadPts, bulges: roadBulges },
    contours,
    control,
  };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export const flat = (pts: Vec3[]) => Float64Array.from(pts.flatMap((p) => [p.x, p.y, p.z]));
