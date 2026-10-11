/**
 * Rough timings for the heavy paths on the bundled demo site:
 *   npm run samples && npm run bench
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Engine } from '../src/engine/engine';

const dir = join(import.meta.dirname, '..', 'public', 'samples');
const read = (f: string) => readFileSync(join(dir, f), 'utf8');

function time<T>(label: string, fn: () => T): T {
  const t0 = performance.now();
  const r = fn();
  console.log(`${label.padEnd(34)} ${(performance.now() - t0).toFixed(1).padStart(8)} ms`);
  return r;
}

const e = new Engine();
const [ex] = time('parse existing ground (LandXML)', () => e.load('existing-ground.xml', read('existing-ground.xml')));
const [de] = time('parse design pad (LandXML)', () => e.load('design-pad.xml', read('design-pad.xml')));
time('parse site plan (DXF)', () => e.load('site-plan.dxf', read('site-plan.dxf')));
time('contours at 0.5 m', () => e.contours(ex!.id, 0.5));
time('cut/fill existing vs design', () => e.cutFill(ex!.id, de!.id));
const line = [{ x: 411000, y: 763400, z: 0 }, { x: 411240, y: 763580, z: 0 }];
time('long section, 300 m at 0.25 m', () => e.profile(line, [ex!.id, de!.id], 0.25));
const zAt = time('1,000,000 elevation lookups', () => {
  let s = 0;
  for (let i = 0; i < 1_000_000; i++) s += e.elevations(411000 + (i % 1000) * 0.24, 763400 + Math.floor(i / 1000) * 0.18, [ex!.id])[0]!.z;
  return s;
});
if (!Number.isFinite(zAt)) throw new Error('lookup returned NaN inside the surface');
