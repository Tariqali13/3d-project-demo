/**
 * World coordinates are projected metres (easting, northing, elevation) and are
 * kept in Float64Arrays end to end. They are only shifted to a local origin and
 * narrowed to Float32 at the GPU boundary (see origin.ts).
 */

export interface Bounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** Triangulated irregular network: a terrain or design surface. */
export interface Tin {
  name: string;
  /** x, y, z per vertex (easting, northing, elevation). */
  positions: Float64Array;
  /** Three vertex indices per triangle. */
  indices: Uint32Array;
}

export interface Polyline {
  layer: string;
  /** x, y, z per vertex. */
  points: Float64Array;
  closed: boolean;
}

export interface PointFeature {
  layer: string;
  x: number;
  y: number;
  z: number;
}

/** CAD linework: polylines, points and any 3D faces (collected into one TIN). */
export interface Drawing {
  name: string;
  polylines: Polyline[];
  points: PointFeature[];
  faces: Tin | null;
  /** Number of 3D faces on each layer that has any (all faces share one TIN). */
  faceLayers?: Record<string, number>;
  layers: string[];
}

export type Dataset =
  | { kind: 'surface'; id: string; name: string; tin: Tin; bounds: Bounds }
  | { kind: 'drawing'; id: string; name: string; drawing: Drawing; bounds: Bounds };

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
