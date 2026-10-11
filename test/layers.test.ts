import { describe, expect, it } from 'vitest';
import { mergeFaceLayers } from '../src/ui/App';

describe('layer list', () => {
  it('includes layers that only hold 3D faces, and counts faces on mixed layers', () => {
    const lines = [{ name: 'ROAD', color: '#000', visible: true, count: 2 }, { name: 'TIN', color: '#111', visible: true, count: 1 }];
    const merged = mergeFaceLayers(lines, { PAD: 4, TIN: 10 });
    expect(merged.map((l) => [l.name, l.count, !!l.faces])).toEqual([
      ['PAD', 4, true],
      ['ROAD', 2, false],
      ['TIN', 11, true],
    ]);
    expect(lines[1]!.count).toBe(1); // input not mutated
  });
});
