/**
 * Writes the bundled demo files to public/samples/:
 *   existing-ground.xml  LandXML TIN of the surveyed site, including a stockpile
 *   design-pad.xml       LandXML TIN of a building pad with 1:2 batters
 *   site-plan.dxf        CAD linework: boundary, pad, road (with an arc), contours, control
 *
 * Deterministic: running it twice produces byte-identical files.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateSite, flat, PAD } from '../src/core/sample';
import { writeDxf, writeLandXml } from '../src/formats/write';

const out = join(import.meta.dirname, '..', 'public', 'samples');
mkdirSync(out, { recursive: true });

const site = generateSite();

writeFileSync(join(out, 'existing-ground.xml'), writeLandXml(site.existing, { description: 'Synthetic topographic survey, Groundwork demo site' }));
writeFileSync(join(out, 'design-pad.xml'), writeLandXml(site.design, { description: `Pad at ${PAD.z.toFixed(2)} m, batters 1:2` }));

writeFileSync(
  join(out, 'site-plan.dxf'),
  writeDxf({
    layerColors: { 'C-PROP': 1, 'C-PAD': 6, 'C-ROAD': 2, 'C-STOCK': 30, 'C-TOPO-MAJR': 8, 'C-TOPO-MINR': 9, 'V-CTRL': 3, 'C-ANNO': 7 },
    polylines: [
      { layer: 'C-PROP', points: flat(site.boundary), closed: true },
      { layer: 'C-PAD', points: flat(site.padOutline), closed: true },
      { layer: 'C-STOCK', points: flat(site.stockpileToe), closed: true },
      { layer: 'C-ROAD', points: flat(site.road.points), closed: false, bulges: site.road.bulges },
      ...site.contours,
    ],
    points: site.control,
    text: [
      { layer: 'C-ANNO', x: PAD.x0 + 4, y: PAD.y0 + PAD.h / 2, height: 3, value: `PAD FFL ${PAD.z.toFixed(2)}` },
    ],
  }),
);

const tri = (t: { indices: Uint32Array }) => (t.indices.length / 3).toLocaleString('en');
console.log(`existing ground: ${tri(site.existing)} triangles`);
console.log(`design pad:      ${tri(site.design)} triangles`);
console.log(`site plan:       ${site.contours.length} contour polylines`);
