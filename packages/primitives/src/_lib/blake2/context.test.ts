import { toHex, type HashContext } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { createBlake2Context } from './context.ts';
import { blake2Digest } from './reference.ts';

/** Deterministic test message of `length` bytes. */
const message = (length: number): Uint8Array => Uint8Array.from({ length }, (_, index) => (index * 151 + 7) & 0xff);

/** `data` split at the given offsets. */
const split = (data: Uint8Array, offsets: readonly number[]): Uint8Array[] => [0, ...offsets].map((start, index) => data.subarray(start, [...offsets, data.length][index]));

const CASES = [
  { flavour: 'blake2s', block: 64, outputs: [16, 32], key: message(32) },
  { flavour: 'blake2b', block: 128, outputs: [20, 64], key: message(64) },
] as const;

describe.each(CASES)('$flavour context', ({ flavour, block, outputs, key }) => {
  const absorbed = (parts: readonly Uint8Array[], outputBytes: number, contextKey?: Uint8Array): HashContext => {
    const context = createBlake2Context(flavour, outputBytes, contextKey);
    for (const part of parts) context.update(part);
    return context;
  };
  const lengths = [0, 1, block - 1, block, block + 1, 2 * block, 3 * block + 17];

  it.each(outputs.flatMap((nn) => lengths.map((length) => [nn, length])))('nn = %i: equals the one-shot hash for a %i-byte message', (nn, length) => {
    const data = message(length);
    expect(toHex(absorbed([data], nn).digest())).toBe(toHex(blake2Digest(flavour, nn, data)));
    expect(toHex(absorbed([data], nn, key).digest())).toBe(toHex(blake2Digest(flavour, nn, data, key)));
  });

  it.each([1, 7, block - 1, block, block + 3, 2 * block])('equals the one-shot hash split at %i and around block boundaries', (at) => {
    const data = message(3 * block + 5);
    expect(absorbed(split(data, [at]), 32).digest()).toEqual(blake2Digest(flavour, 32, data));
    expect(absorbed(split(data, [0, at, at, 2 * block]), 32, key).digest()).toEqual(blake2Digest(flavour, 32, data, key));
  });

  it('equals the one-shot hash when fed byte by byte', () => {
    const data = message(2 * block + 3);
    expect(absorbed(Array.from(data, (byte) => Uint8Array.of(byte)), 32).digest()).toEqual(blake2Digest(flavour, 32, data));
  });

  it('digests a keyed empty message as the key block alone', () => {
    expect(createBlake2Context(flavour, 32, key).digest()).toEqual(blake2Digest(flavour, 32, new Uint8Array(), key));
  });

  it('digest() twice gives the same bytes and does not stop update', () => {
    const context = absorbed([message(block + 2)], 32);
    const first = context.digest();
    expect(context.digest()).toEqual(first);
    context.update(message(5));
    expect(context.digest()).toEqual(blake2Digest(flavour, 32, Uint8Array.from([...message(block + 2), ...message(5)])));
  });

  it('clone() after exactly one block is an independent midstate', () => {
    const base = absorbed([message(block)], 32, key);
    const clone = base.clone();
    clone.update(message(9));
    base.update(message(3));
    expect(clone.digest()).toEqual(blake2Digest(flavour, 32, Uint8Array.from([...message(block), ...message(9)]), key));
    expect(base.digest()).toEqual(blake2Digest(flavour, 32, Uint8Array.from([...message(block), ...message(3)]), key));
  });

  it('rejects bad digest and key lengths', () => {
    expect(() => createBlake2Context(flavour, 0)).toThrow(RangeError);
    expect(() => createBlake2Context(flavour, 32, new Uint8Array(key.length + 1))).toThrow(RangeError);
  });
});
