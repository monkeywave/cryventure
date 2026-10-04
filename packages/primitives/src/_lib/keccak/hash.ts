import type { HashFamily, HashFunction, XofCustomization, XofFunction } from '@cryventure/core';
import { domainSuffix, effectiveDomain, isCustomizable, KECCAK_ALGORITHMS, type KeccakAlgorithm } from './algorithms.ts';
import { createKeccakHashContext, createKeccakXofContext } from './context.ts';
import { concatBytes, cshakePrefix } from './encoding.ts';
import { KECCAK_HASH_IDS, KECCAK_XOF_IDS, type KeccakAlgorithmId } from './manifestKit.ts';
import { sponge } from './sponge.ts';

/**
 * The untraced sponge functions behind the `sha3` producer's `Hash` port (docs/M6.md §1, §2a):
 * SHA3-224 … 512 and Keccak-256 as `HashFunction`s, SHAKE128/256 and cSHAKE128/256 as
 * `XofFunction`s, each with real incremental contexts.
 */

const EMPTY = new Uint8Array(0);

/** N and S of a customization, empty when absent. */
export function customizationParts(custom: XofCustomization | undefined): { functionName: Uint8Array; customization: Uint8Array } {
  return { functionName: custom?.functionName ?? EMPTY, customization: custom?.customization ?? EMPTY };
}

/** Whether N or S is non-empty. */
export function isCustomized(custom: XofCustomization | undefined): boolean {
  const { functionName, customization } = customizationParts(custom);
  return functionName.length > 0 || customization.length > 0;
}

/** The bytes absorbed before the message (cSHAKE's bytepad prefix, else nothing); throws for N or S on a non-customizable function. */
export function absorbedPrefix(algorithm: KeccakAlgorithm, custom: XofCustomization | undefined): Uint8Array {
  if (!isCustomized(custom)) return EMPTY;
  if (!isCustomizable(algorithm)) throw new RangeError(`${algorithm.id}: takes no function name N or customization S`);
  const { functionName, customization } = customizationParts(custom);
  return cshakePrefix(functionName, customization, algorithm.rateBytes);
}

/** The first `outputLength` output bytes of `algorithm` over `data` (any of the nine, untraced). */
export function keccakOutput(algorithm: KeccakAlgorithm, data: Uint8Array, outputLength: number, custom?: XofCustomization): Uint8Array {
  if (!Number.isInteger(outputLength) || outputLength < 0) throw new RangeError(`${algorithm.id}: output length ${outputLength} is not a non-negative integer`);
  const prefix = absorbedPrefix(algorithm, custom);
  const suffix = domainSuffix(effectiveDomain(algorithm, prefix.length > 0));
  return sponge(prefix.length > 0 ? concatBytes(prefix, data) : data, algorithm.rateBytes, suffix, outputLength);
}

function hashFunctionOf(algorithm: KeccakAlgorithm & { outputSize: number }): HashFunction {
  return {
    id: algorithm.id,
    blockSize: algorithm.rateBytes,
    outputSize: algorithm.outputSize,
    hash: (data) => keccakOutput(algorithm, data, algorithm.outputSize),
    create: () => createKeccakHashContext(algorithm.rateBytes, domainSuffix(algorithm.domain), algorithm.outputSize),
  };
}

function xofFunctionOf(algorithm: KeccakAlgorithm): XofFunction {
  return {
    id: algorithm.id,
    blockSize: algorithm.rateBytes,
    securityBits: algorithm.securityBits,
    customizable: isCustomizable(algorithm),
    xof: (data, outputLength, custom) => keccakOutput(algorithm, data, outputLength, custom),
    create(custom) {
      const prefix = absorbedPrefix(algorithm, custom);
      return createKeccakXofContext(algorithm.rateBytes, domainSuffix(effectiveDomain(algorithm, prefix.length > 0)), prefix);
    },
  };
}

function fixedLength(id: KeccakAlgorithmId): KeccakAlgorithm & { outputSize: number } {
  const algorithm = KECCAK_ALGORITHMS[id];
  if (algorithm.outputSize === undefined) throw new RangeError(`${id} is an XOF`);
  return { ...algorithm, outputSize: algorithm.outputSize };
}

/** SHA3-224, SHA3-256, SHA3-384, SHA3-512 and Keccak-256. */
export const KECCAK_HASH_FUNCTIONS: readonly HashFunction[] = KECCAK_HASH_IDS.map((id) => hashFunctionOf(fixedLength(id)));

/** SHAKE128, SHAKE256, cSHAKE128 and cSHAKE256. */
export const KECCAK_XOF_FUNCTIONS: readonly XofFunction[] = KECCAK_XOF_IDS.map((id) => xofFunctionOf(KECCAK_ALGORITHMS[id]));

/** The `Hash` port value of the producer `producerId`: every function and XOF. */
export function keccakHashFamily(producerId: string): HashFamily {
  return { id: producerId, functions: KECCAK_HASH_FUNCTIONS, xofs: KECCAK_XOF_FUNCTIONS };
}
