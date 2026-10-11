import type { Bounds, Vec3 } from './types';

export function emptyBounds(): Bounds {
  return { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
}

export function extendBounds(b: Bounds, xyz: ArrayLike<number>): Bounds {
  for (let i = 0; i + 2 < xyz.length; i += 3) {
    const x = xyz[i]!, y = xyz[i + 1]!, z = xyz[i + 2]!;
    if (x < b.minX) b.minX = x;
    if (y < b.minY) b.minY = y;
    if (z < b.minZ) b.minZ = z;
    if (x > b.maxX) b.maxX = x;
    if (y > b.maxY) b.maxY = y;
    if (z > b.maxZ) b.maxZ = z;
  }
  return b;
}

export function boundsOf(xyz: ArrayLike<number>): Bounds {
  return extendBounds(emptyBounds(), xyz);
}

export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), minZ: Math.min(a.minZ, b.minZ),
    maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY), maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

export function isEmpty(b: Bounds): boolean {
  return !(b.maxX >= b.minX);
}

/** Signed area of triangle abc projected on the XY plane (positive when counter-clockwise). */
export function triAreaXY(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
}

/** Planimetric (plan-view) area of a polygon given as [x, y, ...] or Vec3 list. Shoelace formula. */
export function polygonArea(pts: readonly Vec3[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function polylineLength(pts: readonly Vec3[], mode: '2d' | '3d', closed = false): number {
  let len = 0;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    len += Math.hypot(b.x - a.x, b.y - a.y, mode === '3d' ? b.z - a.z : 0);
  }
  return len;
}

export interface Distance {
  /** Plan distance. */
  horizontal: number;
  /** Straight-line 3D distance. */
  slope: number;
  /** Elevation change from first to second point. */
  dz: number;
  /** Rise over run, percent. Null for a vertical pair. */
  gradePct: number | null;
}

export function distance(a: Vec3, b: Vec3): Distance {
  const horizontal = Math.hypot(b.x - a.x, b.y - a.y);
  const dz = b.z - a.z;
  return {
    horizontal,
    slope: Math.hypot(horizontal, dz),
    dz,
    gradePct: horizontal > 1e-9 ? (dz / horizontal) * 100 : null,
  };
}

/** Ray-casting point-in-polygon test on XY. */
export function pointInPolygon(x: number, y: number, poly: readonly Vec3[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Whole-circle bearing in degrees, clockwise from grid north (+Y). */
export function bearing(a: Vec3, b: Vec3): number {
  const deg = (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI;
  return (deg + 360) % 360;
}
