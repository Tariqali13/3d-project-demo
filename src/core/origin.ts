import type { Bounds } from './types';

/**
 * Survey data lives in projected coordinates such as E 411 020.37, N 763 528.27.
 * GPUs work in float32, which has ~7 significant digits: at 763 528 m the
 * spacing between representable values is 6.25 cm, so vertices snap, lines
 * shimmer and picking is off by centimetres. The fix is to render relative to a
 * local origin near the data and keep world coordinates in float64 everywhere
 * else (measurement, volumes, the coordinate readout).
 */
export interface Origin {
  x: number;
  y: number;
  z: number;
}

/** A round origin near the centre of the data, so local coordinates stay small. */
export function chooseOrigin(b: Bounds, step = 100): Origin {
  const r = (v: number) => Math.round(v / step) * step;
  return { x: r((b.minX + b.maxX) / 2), y: r((b.minY + b.maxY) / 2), z: Math.floor(b.minZ) };
}

/** World float64 xyz -> local float32 xyz for the GPU. */
export function toLocal(world: ArrayLike<number>, o: Origin): Float32Array {
  const out = new Float32Array(world.length);
  for (let i = 0; i + 2 < world.length; i += 3) {
    out[i] = world[i]! - o.x;
    out[i + 1] = world[i + 1]! - o.y;
    out[i + 2] = world[i + 2]! - o.z;
  }
  return out;
}

export function toWorld(local: { x: number; y: number; z: number }, o: Origin) {
  return { x: local.x + o.x, y: local.y + o.y, z: local.z + o.z };
}
