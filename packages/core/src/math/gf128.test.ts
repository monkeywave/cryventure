import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseHexOrThrow, toHex } from '../bytes.ts';
import { GF128_BITS, gf128Bit, gf128Mul, gf128MulSteps, rightShift1 } from './gf128.ts';

/**
 * Independent reference: map a GCM block to a polynomial integer (coefficient of x^i at integer bit i, i.e.
 * reflect the 128 bits), carry-less multiply on BigInt, reduce by x^128 + x^7 + x^2 + x + 1, map back.
 */
const MASK128 = (1n << 128n) - 1n;
const FIELD_POLY = (1n << 128n) | 0x87n;

function toPoly(block: Uint8Array): bigint {
  let poly = 0n;
  for (let i = 0; i < 128; i++) if ((block[i >> 3]! >> (7 - (i & 7))) & 1) poly |= 1n << BigInt(i);
  return poly;
}

function fromPoly(poly: bigint): Uint8Array {
  const block = new Uint8Array(16);
  for (let i = 0; i < 128; i++) if ((poly >> BigInt(i)) & 1n) block[i >> 3]! |= 0x80 >> (i & 7);
  return block;
}

function referenceMul(x: Uint8Array, y: Uint8Array): Uint8Array {
  const a = toPoly(x);
  const b = toPoly(y);
  let product = 0n;
  for (let i = 0n; i < 128n; i++) if ((b >> i) & 1n) product ^= a << i;
  for (let degree = 254n; degree >= 128n; degree--)
    if ((product >> degree) & 1n) product ^= FIELD_POLY << (degree - 128n);
  return fromPoly(product & MASK128);
}

const block16 = fc.uint8Array({ minLength: 16, maxLength: 16 });
const hex = (value: string): Uint8Array => parseHexOrThrow(value);
const ONE = hex('80000000000000000000000000000000');
const ZERO = new Uint8Array(16);

describe('gf128Bit', () => {
  it('reads bit 0 as the MSB of byte 0 and bit 127 as the LSB of byte 15', () => {
    const block = hex('80000000000000000000000000000001');
    expect(gf128Bit(block, 0)).toBe(1);
    expect(gf128Bit(block, 1)).toBe(0);
    expect(gf128Bit(block, 127)).toBe(1);
  });
});

describe('rightShift1', () => {
  it('moves bits towards bit 127 across byte boundaries', () => {
    expect(toHex(rightShift1(hex('01000000000000000000000000000081')))).toBe(
      '00800000000000000000000000000040',
    );
  });
  it('drops bit 127 and does not mutate its input', () => {
    const block = hex('00000000000000000000000000000001');
    expect(toHex(rightShift1(block))).toBe(toHex(ZERO));
    expect(toHex(block)).toBe('00000000000000000000000000000001');
  });
  it('throws RangeError for a non-16-byte block', () => {
    expect(() => rightShift1(new Uint8Array(15))).toThrow(RangeError);
  });
});

describe('gf128Mul', () => {
  it('matches the McGrew–Viega TC 2 GHASH: (C₁·H ⊕ L)·H', () => {
    const h = hex('66e94bd4ef8a2c3b884cfa59ca342b2e');
    const x1 = gf128Mul(hex('0388dace60b6a392f328c2b971b2fe78'), h);
    expect(toHex(x1)).toBe('5e2ec746917062882c85b0685353deb7');
    const lengths = hex('00000000000000000000000000000080');
    expect(
      toHex(
        gf128Mul(
          Uint8Array.from(x1, (b, i) => b ^ lengths[i]!),
          h,
        ),
      ),
    ).toBe('f38cbb1ad69223dcc3457ae5b6b0f885');
  });

  it('reduces x^127·x = x^128 to 1 + x + x^2 + x^7 (R)', () => {
    expect(
      toHex(
        gf128Mul(hex('00000000000000000000000000000001'), hex('40000000000000000000000000000000')),
      ),
    ).toBe('e1000000000000000000000000000000');
  });

  it('matches the independent BigInt carry-less reference', () => {
    fc.assert(
      fc.property(block16, block16, (x, y) => toHex(gf128Mul(x, y)) === toHex(referenceMul(x, y))),
      { numRuns: 200 },
    );
  });

  it('is commutative, has 1 as identity and 0 as absorbing element', () => {
    fc.assert(
      fc.property(block16, block16, (x, y) => {
        expect(toHex(gf128Mul(x, y))).toBe(toHex(gf128Mul(y, x)));
        expect(toHex(gf128Mul(x, ONE))).toBe(toHex(x));
        expect(toHex(gf128Mul(ZERO, y))).toBe(toHex(ZERO));
      }),
      { numRuns: 100 },
    );
  });

  it('distributes over XOR', () => {
    fc.assert(
      fc.property(block16, block16, block16, (x, y, z) => {
        const yz = Uint8Array.from(y, (b, i) => b ^ z[i]!);
        const sum = Uint8Array.from(gf128Mul(x, y), (b, i) => b ^ gf128Mul(x, z)[i]!);
        expect(toHex(gf128Mul(x, yz))).toBe(toHex(sum));
      }),
      { numRuns: 50 },
    );
  });

  it('does not mutate its inputs and throws RangeError for wrong lengths', () => {
    const x = hex('0388dace60b6a392f328c2b971b2fe78');
    const y = hex('66e94bd4ef8a2c3b884cfa59ca342b2e');
    gf128Mul(x, y);
    expect(toHex(x)).toBe('0388dace60b6a392f328c2b971b2fe78');
    expect(toHex(y)).toBe('66e94bd4ef8a2c3b884cfa59ca342b2e');
    expect(() => gf128Mul(new Uint8Array(16), new Uint8Array(8))).toThrow(RangeError);
    expect(() => gf128Mul(new Uint8Array(17), new Uint8Array(16))).toThrow(RangeError);
  });
});

describe('gf128MulSteps', () => {
  it('records 128 consistent Algorithm 1 iterations ending in gf128Mul', () => {
    fc.assert(
      fc.property(block16, block16, (x, y) => {
        const { steps, result } = gf128MulSteps(x, y);
        expect(steps).toHaveLength(GF128_BITS);
        let z: Uint8Array = new Uint8Array(16);
        let v: Uint8Array = Uint8Array.from(y);
        steps.forEach((step, i) => {
          expect(step.bit).toBe(i);
          expect(step.xBit).toBe(gf128Bit(x, i));
          expect(toHex(step.z)).toBe(
            toHex(step.xBit ? Uint8Array.from(z, (b, j) => b ^ v[j]!) : z),
          );
          expect(step.reduced).toBe(gf128Bit(v, 127) === 1);
          const shifted = rightShift1(v);
          if (step.reduced) shifted[0]! ^= 0xe1;
          expect(toHex(step.v)).toBe(toHex(shifted));
          ({ z, v } = step);
        });
        expect(toHex(result)).toBe(toHex(z));
        expect(toHex(result)).toBe(toHex(referenceMul(x, y)));
      }),
      { numRuns: 20 },
    );
  });

  it('echoes copies of the operands', () => {
    const x = hex('0388dace60b6a392f328c2b971b2fe78');
    const explained = gf128MulSteps(x, ONE);
    expect(explained.x).not.toBe(x);
    expect(toHex(explained.x)).toBe(toHex(x));
    expect(toHex(explained.y)).toBe(toHex(ONE));
  });
});
