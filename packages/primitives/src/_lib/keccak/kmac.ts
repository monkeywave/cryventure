import { concatBlocks, utf8Bytes, type MacContext, type MacFamily, type MacFunction, type MacOptions, type XofContext } from '@cryventure/core';
import { KECCAK_ALGORITHMS, type KeccakAlgorithm } from './algorithms.ts';
import { createKeccakXofContext } from './context.ts';
import { bytepad, cshakePrefix, encodeString, rightEncode } from './encoding.ts';
import { keccakOutput } from './hash.ts';
import { KMAC_MAC_IDS, type KmacAlgorithmId } from './manifestKit.ts';
import { DOMAIN_SUFFIXES } from './padding.ts';

/**
 * KMAC and KMACXOF (SP 800-185 §4; docs/M7.md §2c), untraced:
 * KMAC(K, X, L, S) = cSHAKE(bytepad(encode_string(K), r) ‖ X ‖ right_encode(L), L, "KMAC", S), with
 * right_encode(0) for KMACXOF. The `Mac` port's KMAC128/256 run on the hi/lo sponge contexts.
 */

/** cSHAKE's function name N for KMAC: the string "KMAC". */
export const KMAC_FUNCTION_NAME = 'KMAC';
const KMAC_N = utf8Bytes(KMAC_FUNCTION_NAME);

/** One KMAC variant: its cSHAKE, its display name and whether it is the XOF. */
export interface KmacVariant {
  id: KmacAlgorithmId;
  name: string;
  cshake: KeccakAlgorithm;
  xof: boolean;
  /** The `Mac` port's default tag length: 2 × the security strength (KMAC128: 32 bytes, KMAC256: 64). */
  defaultOutputSize: number;
}

function variant(id: KmacAlgorithmId, name: string, cshake: KeccakAlgorithm, xof: boolean): KmacVariant {
  return { id, name, cshake, xof, defaultOutputSize: cshake.securityBits / 4 };
}

export const KMAC_VARIANTS: Readonly<Record<KmacAlgorithmId, KmacVariant>> = {
  kmac128: variant('kmac128', 'KMAC128', KECCAK_ALGORITHMS.cshake128, false),
  kmac256: variant('kmac256', 'KMAC256', KECCAK_ALGORITHMS.cshake256, false),
  kmacxof128: variant('kmacxof128', 'KMACXOF128', KECCAK_ALGORITHMS.cshake128, true),
  kmacxof256: variant('kmacxof256', 'KMACXOF256', KECCAK_ALGORITHMS.cshake256, true),
};

/** bytepad(encode_string(K), r): the key in whole rate blocks (§4.3 step 1). */
export function kmacEncodedKey(key: Uint8Array, rateBytes: number): Uint8Array {
  return bytepad(encodeString(key), rateBytes);
}

/** right_encode(L) with L in bits for KMAC, right_encode(0) for KMACXOF (§4.3 step 2, §4.3.1). */
export function kmacEncodedLength(outputLength: number, xof: boolean): Uint8Array {
  return rightEncode(xof ? 0 : outputLength * 8);
}

/** cSHAKE's prefix bytepad(encode_string("KMAC") ‖ encode_string(S), r). */
export function kmacPrefix(customization: Uint8Array, rateBytes: number): Uint8Array {
  return cshakePrefix(KMAC_N, customization, rateBytes);
}

/** The `outputLength` bytes of `variant` over K, X and S (untraced, one-shot). */
export function kmacOutput(variant: KmacVariant, key: Uint8Array, data: Uint8Array, outputLength: number, customization: Uint8Array): Uint8Array {
  const { rateBytes } = variant.cshake;
  const newX = concatBlocks([kmacEncodedKey(key, rateBytes), data, kmacEncodedLength(outputLength, variant.xof)]);
  return keccakOutput(variant.cshake, newX, outputLength, { functionName: KMAC_N, customization });
}

/** L from the options: the default tag length, or a positive integer number of bytes. */
function outputLengthOf(id: string, defaultLength: number, options: MacOptions | undefined): number {
  const length = options?.outputLength ?? defaultLength;
  if (!Number.isInteger(length) || length < 1) throw new RangeError(`${id}: output length ${length} is not a positive integer`);
  return length;
}

/** The context over a cSHAKE sponge that has absorbed the prefix and the encoded key: `mac()` appends right_encode(L) to a copy. */
function kmacContext(sponge: XofContext, outputLength: number): MacContext {
  return {
    update: (data) => sponge.update(data),
    mac() {
      const finished = sponge.clone();
      finished.update(kmacEncodedLength(outputLength, false));
      return finished.squeeze(outputLength);
    },
    clone: () => kmacContext(sponge.clone(), outputLength),
  };
}

/** KMAC128 or KMAC256 as a `Mac` member: customizable, variable output, any key length. */
export function kmacFunction(variant: KmacVariant): MacFunction {
  if (variant.xof) throw new RangeError(`${variant.id}: KMACXOF is not a Mac port member`);
  const { rateBytes } = variant.cshake;
  const create = (key: Uint8Array, options?: MacOptions): MacContext => {
    const outputLength = outputLengthOf(variant.id, variant.defaultOutputSize, options);
    const sponge = createKeccakXofContext(rateBytes, DOMAIN_SUFFIXES.cshake, kmacPrefix(options?.customization ?? new Uint8Array(0), rateBytes));
    sponge.update(kmacEncodedKey(key, rateBytes));
    return kmacContext(sponge, outputLength);
  };
  return {
    id: variant.id,
    outputSize: variant.defaultOutputSize,
    blockSize: rateBytes,
    keySizes: { min: 0 },
    customizable: true,
    variableOutput: true,
    construction: { kind: 'kmac' },
    create,
    mac(key, data, options) {
      const context = create(key, options);
      context.update(data);
      return context.mac();
    },
  };
}

/** The `Mac` port value of the producer `producerId`: KMAC128 and KMAC256. */
export function kmacFamily(producerId: string): MacFamily {
  return { id: producerId, functions: KMAC_MAC_IDS.map((id) => kmacFunction(KMAC_VARIANTS[id])) };
}
