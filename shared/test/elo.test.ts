import { describe, expect, it } from 'vitest';
import { expected, kFactor, ratingDelta, stakes } from '../src/index.js';

describe('elo', () => {
  it('equal ratings expect half a point', () => {
    expect(expected(1000, 1000)).toBeCloseTo(0.5);
    expect(expected(1400, 1000)).toBeCloseTo(0.909, 3);
  });

  it('uses a higher K while provisional', () => {
    expect(kFactor(0)).toBe(40);
    expect(kFactor(29)).toBe(40);
    expect(kFactor(30)).toBe(20);
  });

  it('two new 1000 players move by 20', () => {
    expect(ratingDelta(1000, 1000, 1, 0)).toBe(20);
    expect(ratingDelta(1000, 1000, 0, 0)).toBe(-20);
    expect(ratingDelta(1000, 1000, 0.5, 0)).toBe(0);
  });

  it('upsets pay more than expected wins', () => {
    expect(ratingDelta(1000, 1400, 1, 50)).toBe(18);
    expect(ratingDelta(1400, 1000, 1, 50)).toBe(2);
    expect(ratingDelta(1400, 1000, 0, 50)).toBe(-18);
  });

  it('decisive results always move at least a point', () => {
    expect(ratingDelta(2400, 1000, 1, 100)).toBe(1);
    expect(ratingDelta(1000, 2400, 0, 100)).toBe(-1);
  });

  it('stakes lists win/draw/loss', () => {
    expect(stakes(1000, 1100, 0)).toEqual({ win: 26, draw: 6, loss: -14 });
  });
});
