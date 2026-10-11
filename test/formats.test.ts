import { describe, expect, it } from 'vitest';
import { parseLandXml } from '../src/formats/landxml';
import { bulgeArc, parseDxf } from '../src/formats/dxf';

const LANDXML = `<?xml version="1.0"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2">
  <Surfaces>
    <Surface name="Existing ground">
      <Definition surfType="TIN">
        <Pnts>
          <P id="10">763500.0 411000.0 80.0</P>
          <P id="20">763500.0 411010.0 81.0</P>
          <P id="30">763510.0 411000.0 82.0</P>
          <P id="40">763510.0 411010.0 83.0</P>
        </Pnts>
        <Faces>
          <F>10 20 40</F>
          <F>10 40 30</F>
          <F i="1">10 20 30</F>
        </Faces>
      </Definition>
    </Surface>
  </Surfaces>
</LandXML>`;

describe('LandXML', () => {
  it('reads points as northing easting elevation', () => {
    const [s] = parseLandXml(LANDXML);
    expect(s!.name).toBe('Existing ground');
    // Point 20 is 10 m east of point 10, so x (easting) differs, y (northing) does not.
    expect([...s!.positions.slice(3, 6)]).toEqual([411010, 763500, 81]);
  });

  it('maps non-contiguous point ids and skips invisible faces', () => {
    const [s] = parseLandXml(LANDXML);
    expect([...s!.indices]).toEqual([0, 1, 3, 0, 3, 2]);
  });

  it('explains what is wrong with an unexpected file', () => {
    expect(() => parseLandXml('<LandXML><Alignments/></LandXML>')).toThrow(/No <Surface>/);
  });
});

/** Minimal ASCII DXF writer for fixtures. */
function dxf(entities: string[]): string {
  return ['0', 'SECTION', '2', 'ENTITIES', ...entities.flatMap((e) => e.split('\n')), '0', 'ENDSEC', '0', 'EOF'].join('\n');
}

describe('DXF', () => {
  it('turns a semicircular bulge into points on the arc', () => {
    // From (0,0) to (2,0), bulge 1 = 180° counter-clockwise: centre (1,0), radius 1, passing below.
    const pts = bulgeArc({ x: 0, y: 0 }, { x: 2, y: 0 }, 1, 5);
    for (let i = 0; i < pts.length; i += 3) {
      expect(Math.hypot(pts[i]! - 1, pts[i + 1]!)).toBeCloseTo(1, 9);
      expect(pts[i + 1]!).toBeLessThan(0);
      expect(pts[i + 2]).toBe(5);
    }
    const mirrored = bulgeArc({ x: 0, y: 0 }, { x: 2, y: 0 }, -1, 0);
    expect(mirrored[1]!).toBeGreaterThan(0);
  });

  it('reads lines, elevated polylines, 3D polylines, points and faces with their layers', () => {
    const text = dxf([
      '0\nLINE\n8\nROAD\n10\n0\n20\n0\n30\n1\n11\n10\n21\n0\n31\n2',
      '0\nLWPOLYLINE\n8\nCONTOURS\n90\n3\n70\n0\n38\n85\n10\n0\n20\n0\n10\n5\n20\n0\n10\n5\n20\n5',
      '0\nPOLYLINE\n8\nBREAKLINES\n66\n1\n70\n8\n0\nVERTEX\n8\nBREAKLINES\n10\n0\n20\n0\n30\n80\n70\n32\n0\nVERTEX\n8\nBREAKLINES\n10\n1\n20\n1\n30\n81\n70\n32\n0\nSEQEND',
      '0\nPOINT\n8\nCONTROL\n10\n411000\n20\n763500\n30\n84.5',
      '0\n3DFACE\n8\nTIN\n10\n0\n20\n0\n30\n1\n11\n1\n21\n0\n31\n1\n12\n1\n22\n1\n32\n1\n13\n1\n23\n1\n33\n1',
      '0\nTEXT\n8\nNOTES\n10\n0\n20\n0\n40\n1\n1\nhello',
    ]);
    const d = parseDxf(text, 'site.dxf');
    expect(d.layers).toEqual(['BREAKLINES', 'CONTOURS', 'CONTROL', 'ROAD', 'TIN']);
    const contour = d.polylines.find((p) => p.layer === 'CONTOURS')!;
    expect(contour.points[2]).toBe(85); // LWPOLYLINE elevation applied to every vertex
    const brk = d.polylines.find((p) => p.layer === 'BREAKLINES')!;
    expect([...brk.points]).toEqual([0, 0, 80, 1, 1, 81]);
    expect(d.points[0]).toEqual({ layer: 'CONTROL', x: 411000, y: 763500, z: 84.5 });
    expect(d.faces!.indices.length).toBe(3); // 4th vertex repeats the 3rd: one triangle
    expect(d.skipped).toEqual({ TEXT: 1 });
    expect(d.faceLayers).toEqual({ TIN: 1 });
  });
});
