import { absorbHiLo, hiLoStateBytes, keccakF1600HiLo, zeroHiLoState, type KeccakHiLoState } from './hilo.ts';
import { spongePad, type DomainSuffix } from './padding.ts';

/**
 * SPONGE[Keccak-f[1600], pad10*1, r] (FIPS 202 §4, Algorithm 8) on the hi/lo permutation
 * (docs/M7.md §2a): the `Hash` port's one-shot functions and contexts. Same bytes as `sponge.ts`,
 * which the traced recordings keep.
 */

/** `outputLength` bytes squeezed from an absorbed (already permuted) state; `absorbed` is left unchanged. */
export function squeezeFromHiLo(absorbed: KeccakHiLoState, rateBytes: number, outputLength: number): Uint8Array {
  const out = new Uint8Array(outputLength);
  const state = absorbed.slice();
  for (let offset = 0; offset < outputLength; offset += rateBytes) {
    if (offset > 0) keccakF1600HiLo(state);
    out.set(hiLoStateBytes(state, Math.min(rateBytes, outputLength - offset)), offset);
  }
  return out;
}

/** The first `outputLength` bytes of SPONGE[f, pad, r](`input` ‖ suffix, d), on hi/lo lanes. */
export function spongeHiLo(input: Uint8Array, rateBytes: number, suffix: DomainSuffix, outputLength: number): Uint8Array {
  const { padded } = spongePad(input, rateBytes, suffix);
  const state = zeroHiLoState();
  for (let offset = 0; offset < padded.length; offset += rateBytes) keccakF1600HiLo(absorbHiLo(state, padded.subarray(offset, offset + rateBytes)));
  return squeezeFromHiLo(state, rateBytes, outputLength);
}
