import type { HashFamily, HashFunction } from '@cryventure/core';
import { createBlake2Context } from './context.ts';
import { BLAKE2_IDS, blake2Flavour, blake2OutputBytes, type Blake2Id } from './manifestKit.ts';
import { blake2Digest, blake2Engine } from './reference.ts';

/**
 * The eight unkeyed BLAKE2 `HashFunction`s of RFC 7693 §4 behind the producer's `Hash` port
 * (docs/M6.md §2d). Keyed BLAKE2 as a MAC is Phase 2b's `Mac` port; the lib already takes a key.
 */

/** BLAKE2 of `data` under a function id, optionally keyed (untraced). */
export function blake2Hash(id: Blake2Id, data: Uint8Array, key?: Uint8Array): Uint8Array {
  return blake2Digest(blake2Flavour(id), blake2OutputBytes(id), data, key);
}

function blake2HashFunction(id: Blake2Id): HashFunction {
  const flavour = blake2Flavour(id);
  const outputSize = blake2OutputBytes(id);
  return {
    id,
    blockSize: blake2Engine(flavour).blockBytes,
    outputSize,
    hash: (data) => blake2Digest(flavour, outputSize, data),
    create: () => createBlake2Context(flavour, outputSize),
  };
}

/** The eight functions, in `BLAKE2_IDS` order. */
export const BLAKE2_FUNCTIONS: readonly HashFunction[] = BLAKE2_IDS.map(blake2HashFunction);

/** The producer's `Hash` port value: family `producerId` with all eight functions. */
export function blake2HashFamily(producerId: string): HashFamily {
  return { id: producerId, functions: BLAKE2_FUNCTIONS };
}
