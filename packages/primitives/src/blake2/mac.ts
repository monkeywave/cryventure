import type { HashContext, MacContext, MacFamily, MacFunction, MacOptions } from '@cryventure/core';
import { createBlake2Context } from '../_lib/blake2/context.ts';
import { blake2Hash } from '../_lib/blake2/hash.ts';
import { BLAKE2_IDS, blake2Flavour, blake2MaxKeyBytes, blake2OutputBytes, type Blake2Id } from '../_lib/blake2/manifestKit.ts';
import { blake2Engine } from '../_lib/blake2/reference.ts';
import { rejectFixedMacOptions } from '../_lib/hmac/hmac.ts';

/**
 * Keyed BLAKE2 as a MAC (RFC 7693 §2.5, §3.3; docs/M7.md §2a): the `Mac` port of the `blake2`
 * producer, one member per hash id. The key is block 0 of the hash, so a 0-byte key is the unkeyed
 * hash and not a MAC: `keySizes` start at 1.
 */

/** Throws a RangeError unless 1 ≤ |key| ≤ the flavour's maximum (32 for BLAKE2s, 64 for BLAKE2b). */
function checkMacKey(id: Blake2Id, key: Uint8Array): void {
  const max = blake2MaxKeyBytes(id);
  if (key.length < 1 || key.length > max) throw new RangeError(`${id}: a MAC key must be 1..${max} bytes (got ${key.length})`);
}

/** The keyed hash context as a MAC context: `mac()` is the digest of a copy. */
function macContextOf(context: HashContext): MacContext {
  return {
    update: (data) => context.update(data),
    mac: () => context.digest(),
    clone: () => macContextOf(context.clone()),
  };
}

function keyedBlake2Function(id: Blake2Id): MacFunction {
  const flavour = blake2Flavour(id);
  const outputSize = blake2OutputBytes(id);
  const checkCall = (key: Uint8Array, options: MacOptions | undefined): void => {
    rejectFixedMacOptions(id, options);
    checkMacKey(id, key);
  };
  return {
    id,
    outputSize,
    blockSize: blake2Engine(flavour).blockBytes,
    keySizes: { min: 1, max: blake2MaxKeyBytes(id) },
    customizable: false,
    variableOutput: false,
    construction: { kind: 'keyed-hash' },
    mac(key, data, options) {
      checkCall(key, options);
      return blake2Hash(id, data, key);
    },
    create(key, options) {
      checkCall(key, options);
      return macContextOf(createBlake2Context(flavour, outputSize, key));
    },
  };
}

/** The eight keyed functions, in `BLAKE2_IDS` order. */
export const KEYED_BLAKE2_FUNCTIONS: readonly MacFunction[] = BLAKE2_IDS.map(keyedBlake2Function);

/** The producer's `Mac` port value: family `producerId` with all eight keyed functions. */
export function keyedBlake2Family(producerId: string): MacFamily {
  return { id: producerId, functions: KEYED_BLAKE2_FUNCTIONS };
}
