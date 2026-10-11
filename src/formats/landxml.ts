import { XMLParser } from 'fast-xml-parser';
import type { Tin } from '../core/types';

/**
 * LandXML surfaces (<Surface><Definition surfType="TIN">).
 *
 * Gotcha worth a test: LandXML writes points as "northing easting elevation",
 * i.e. Y before X. Reading them in the obvious order mirrors the site across
 * its diagonal, which still "looks like terrain" and is easy to miss.
 * Faces reference point ids (not positions), ids need not be contiguous, and
 * faces flagged i="1" are invisible (holes, outside the boundary) and skipped.
 */
export function parseLandXml(text: string): Tin[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    textNodeName: '#text',
    parseTagValue: false,
    isArray: (name) => ['Surface', 'P', 'F'].includes(name),
  });
  const doc = parser.parse(text);
  const surfaces: unknown[] = doc?.LandXML?.Surfaces?.Surface ?? [];
  if (!surfaces.length) throw new Error('No <Surface> found. Is this a LandXML TIN surface file?');

  return surfaces.map((s, n) => {
    const surf = s as { '@name'?: string; Definition?: { Pnts?: { P?: unknown[] }; Faces?: { F?: unknown[] } } };
    const pts = surf.Definition?.Pnts?.P ?? [];
    const faces = surf.Definition?.Faces?.F ?? [];
    const idToIndex = new Map<string, number>();
    const positions = new Float64Array(pts.length * 3);
    pts.forEach((p, i) => {
      const node = p as { '@id'?: string; '#text'?: string };
      const [north, east, elev] = (node['#text'] ?? '').trim().split(/\s+/).map(Number);
      if (![north, east, elev].every((v) => Number.isFinite(v))) throw new Error(`Point ${node['@id'] ?? i} is not "northing easting elevation"`);
      positions[i * 3] = east!;
      positions[i * 3 + 1] = north!;
      positions[i * 3 + 2] = elev!;
      idToIndex.set(String(node['@id'] ?? i + 1), i);
    });
    const indices: number[] = [];
    for (const f of faces) {
      const node = typeof f === 'string' ? { '#text': f } : (f as { '@i'?: string; '#text'?: string });
      if (node['@i'] === '1') continue;
      const ids = (node['#text'] ?? '').trim().split(/\s+/);
      if (ids.length < 3) continue;
      const tri = ids.slice(0, 3).map((id) => idToIndex.get(id));
      if (tri.some((v) => v === undefined)) throw new Error(`Face references unknown point id in "${node['#text']}"`);
      indices.push(...(tri as number[]));
    }
    return { name: surf['@name'] ?? `Surface ${n + 1}`, positions, indices: Uint32Array.from(indices) };
  });
}
