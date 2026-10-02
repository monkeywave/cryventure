import { describe, expect, it } from 'vitest';
import { gmul, ginv, gpow, xtime } from './gf256.ts';

const ALL_BYTES = Array.from({ length: 256 }, (_, i) => i);

describe('xtime', () => {
  it('matches FIPS 197 §4.2 examples', () => {
    expect([0x57, 0xae, 0x47, 0x8e].map(xtime)).toEqual([0xae, 0x47, 0x8e, 0x07]);
  });

  it('equals gmul by 2 for every byte', () => {
    for (const b of ALL_BYTES) expect(xtime(b)).toBe(gmul(b, 2));
  });
});

describe('gmul', () => {
  it('matches FIPS 197 examples {57}·{83}={c1} and {57}·{13}={fe}', () => {
    expect(gmul(0x57, 0x83)).toBe(0xc1);
    expect(gmul(0x57, 0x13)).toBe(0xfe);
  });

  it('is commutative and has 1 as identity and 0 as absorbing element', () => {
    for (const a of ALL_BYTES) {
      expect(gmul(a, 1)).toBe(a);
      expect(gmul(a, 0)).toBe(0);
      expect(gmul(a, 0x53)).toBe(gmul(0x53, a));
    }
  });
});

describe('gpow', () => {
  it('computes small powers and a^255 = 1 for a ≠ 0', () => {
    expect(gpow(0x02, 8)).toBe(0x1b);
    expect(gpow(0x03, 0)).toBe(1);
    for (const a of ALL_BYTES.slice(1)) expect(gpow(a, 255)).toBe(1);
  });
});

describe('ginv', () => {
  it('maps 0 to 0', () => {
    expect(ginv(0)).toBe(0);
  });

  it('is a true inverse for all 255 non-zero bytes', () => {
    for (const a of ALL_BYTES.slice(1)) expect(gmul(a, ginv(a))).toBe(1);
  });

  it('matches the FIPS example {53}^-1 = {ca}', () => {
    expect(ginv(0x53)).toBe(0xca);
  });
});
