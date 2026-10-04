import { toHex, type HashContext, type HashFunction } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { createLegacyContext, MD5_ENGINE, SHA1_ENGINE } from './context.ts';
import { MD5_FUNCTION, SHA1_FUNCTION } from './hash.ts';
import { md5Digest } from './md5.ts';
import { sha1Digest } from './sha1.ts';

/** Deterministic test message of `length` bytes. */
const message = (length: number): Uint8Array => Uint8Array.from({ length }, (_, index) => (index * 151 + 7) & 0xff);

/** The context after absorbing `parts` in order. */
function absorbed(fn: HashFunction, parts: readonly Uint8Array[]): HashContext {
  const context = fn.create();
  for (const part of parts) context.update(part);
  return context;
}

/** `data` split at the given offsets. */
const split = (data: Uint8Array, offsets: readonly number[]): Uint8Array[] => [0, ...offsets].map((start, index) => data.subarray(start, [...offsets, data.length][index]));

describe('createLegacyContext', () => {
  it.each([
    ['md5', MD5_ENGINE, md5Digest],
    ['sha-1', SHA1_ENGINE, sha1Digest],
  ] as const)('%s: a fresh context digests the empty message; update then digest equals the reference', (_id, engine, digest) => {
    expect(createLegacyContext(engine).digest()).toEqual(digest(new Uint8Array(0)));
    const context = createLegacyContext(engine);
    context.update(message(130));
    expect(context.digest()).toEqual(digest(message(130)));
  });
});

describe.each([MD5_FUNCTION, SHA1_FUNCTION].map((fn) => [fn.id, fn] as const))('%s context', (_id, fn) => {
  const block = fn.blockSize;
  const lengths = [0, 1, block - 9, block - 8, block - 1, block, block + 1, 2 * block, 3 * block + 17];

  it.each(lengths)('equals hash() for a %i-byte message in one update', (length) => {
    const data = message(length);
    expect(toHex(absorbed(fn, [data]).digest())).toBe(toHex(fn.hash(data)));
  });

  it.each([1, 7, block - 1, block, block + 3])('equals hash() for a %i-byte split point and every split around block boundaries', (at) => {
    const data = message(3 * block + 5);
    expect(absorbed(fn, split(data, [at])).digest()).toEqual(fn.hash(data));
    expect(absorbed(fn, split(data, [0, at, at, 2 * block])).digest()).toEqual(fn.hash(data));
  });

  it('equals hash() when fed byte by byte', () => {
    const data = message(2 * block + 3);
    expect(absorbed(fn, Array.from(data, (byte) => Uint8Array.of(byte))).digest()).toEqual(fn.hash(data));
  });

  it('digest() twice gives the same bytes and does not stop update', () => {
    const data = message(block + 10);
    const context = absorbed(fn, [data.subarray(0, 20)]);
    const first = context.digest();
    expect(context.digest()).toEqual(first);
    expect(first).toEqual(fn.hash(data.subarray(0, 20)));
    context.update(data.subarray(20));
    expect(context.digest()).toEqual(fn.hash(data));
  });

  it('a clone is independent of its source (midstate after one block)', () => {
    const prefix = message(block);
    const source = absorbed(fn, [prefix]);
    const clone = source.clone();
    source.update(Uint8Array.of(1, 2, 3));
    clone.update(Uint8Array.of(9));
    expect(source.digest()).toEqual(fn.hash(Uint8Array.of(...prefix, 1, 2, 3)));
    expect(clone.digest()).toEqual(fn.hash(Uint8Array.of(...prefix, 9)));
  });

  it('a clone of a partial block keeps its own copy of the partial bytes', () => {
    const source = absorbed(fn, [message(5)]);
    const clone = source.clone();
    clone.update(message(block));
    source.update(Uint8Array.of(0xff));
    expect(source.digest()).toEqual(fn.hash(Uint8Array.of(...message(5), 0xff)));
    expect(clone.digest()).toEqual(fn.hash(Uint8Array.of(...message(5), ...message(block))));
  });

  it('does not keep a reference to the caller’s buffer', () => {
    const data = message(10);
    const context = absorbed(fn, [data]);
    data.fill(0);
    expect(context.digest()).toEqual(fn.hash(message(10)));
  });

  it('is a real context: after one whole block it holds no message bytes', () => {
    const internals = JSON.stringify(absorbed(fn, [message(block)]));
    expect(internals).toContain('"partialLength":0');
    expect(internals).toContain(`"messageBytes":${block}`);
  });
});
