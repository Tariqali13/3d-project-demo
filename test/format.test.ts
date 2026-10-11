import { describe, expect, it } from 'vitest';
import { dms, grouped, niceLength, niceTicks } from '../src/ui/format';

describe('formatting', () => {
  it('groups survey coordinates with thin spaces', () => {
    expect(grouped(763528.2714)).toBe('763 528.271');
    expect(grouped(-1234.5, 1)).toBe('−1 234.5');
    expect(grouped(NaN)).toBe('—');
  });

  it('formats bearings as DMS and carries rounding', () => {
    expect(dms(90)).toBe('90° 00′ 00″');
    expect(dms(45.5)).toBe('45° 30′ 00″');
    expect(dms(359.99999)).toBe('0° 00′ 00″');
  });

  it('picks round scale-bar lengths and ticks', () => {
    expect(niceLength(37)).toBe(20);
    expect(niceLength(0.7)).toBe(0.5);
    expect(niceTicks(81.3, 92.6)).toEqual([82, 84, 86, 88, 90, 92]);
  });
});
