import { describe, expect, it } from 'vitest';
import { timingSafeEqual, timingSafeEqualSteps } from './timingSafeEqual.ts';

const of = (...values: number[]) => Uint8Array.from(values);

describe('timingSafeEqual', () => {
  it('accepts equal tags', () => {
    expect(timingSafeEqual(of(1, 2, 3), of(1, 2, 3))).toBe(true);
    expect(timingSafeEqual(of(), of())).toBe(true);
  });

  it('rejects a difference in the first, a middle or the last byte', () => {
    expect(timingSafeEqual(of(1, 2, 3), of(0, 2, 3))).toBe(false);
    expect(timingSafeEqual(of(1, 2, 3), of(1, 0x82, 3))).toBe(false);
    expect(timingSafeEqual(of(1, 2, 3), of(1, 2, 2))).toBe(false);
  });

  it('rejects a shorter or longer actual tag, even when it is a prefix or extension of the expected one', () => {
    expect(timingSafeEqual(of(1, 2, 3), of(1, 2))).toBe(false);
    expect(timingSafeEqual(of(1, 2, 0), of(1, 2))).toBe(false);
    expect(timingSafeEqual(of(1, 2), of(1, 2, 3))).toBe(false);
    expect(timingSafeEqual(of(), of(0))).toBe(false);
    expect(timingSafeEqual(of(0), of())).toBe(false);
  });

  it('reads every byte of the expected tag, also on a length mismatch (no early exit)', () => {
    const read: number[] = [];
    const expected = new Proxy(of(9, 8, 7, 6), {
      get(target, property) {
        if (typeof property === 'string' && /^\d+$/.test(property)) read.push(Number(property));
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    expect(timingSafeEqual(expected, of(0))).toBe(false);
    expect(read).toEqual([0, 1, 2, 3]);
  });
});

describe('timingSafeEqualSteps', () => {
  it('records the XOR of each byte pair and the running OR', () => {
    expect(timingSafeEqualSteps(of(0x0f, 0xf0, 0xaa), of(0x0f, 0xf1, 0x2a))).toEqual({
      lengthsMatch: true,
      steps: [
        { index: 0, difference: 0x00, accumulator: 0x00 },
        { index: 1, difference: 0x01, accumulator: 0x01 },
        { index: 2, difference: 0x80, accumulator: 0x81 },
      ],
      equal: false,
    });
  });

  it('walks all of expected on a length mismatch, comparing missing bytes as 0', () => {
    const trace = timingSafeEqualSteps(of(0, 5), of(0));
    expect(trace).toEqual({
      lengthsMatch: false,
      steps: [
        { index: 0, difference: 0, accumulator: 0 },
        { index: 1, difference: 5, accumulator: 5 },
      ],
      equal: false,
    });
    expect(timingSafeEqualSteps(of(0, 0), of(0)).equal).toBe(false);
  });

  it('agrees with timingSafeEqual', () => {
    const pairs: [Uint8Array, Uint8Array][] = [
      [of(1, 2), of(1, 2)],
      [of(1, 2), of(1, 3)],
      [of(1, 0), of(1)],
      [of(), of()],
      [of(), of(1)],
    ];
    for (const [expected, actual] of pairs) expect(timingSafeEqualSteps(expected, actual).equal).toBe(timingSafeEqual(expected, actual));
  });
});
