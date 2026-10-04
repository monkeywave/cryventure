import { i18nRef, narrationFromState, type AnyStateFacet, type I18nRef, type PrimitiveRecording } from '@cryventure/core';
import { SHA512_IV, SHA512_T_IV_MASK } from '../_lib/sha2/constants.ts';
import { WORD64, wordsHex } from '../_lib/sha2/words.ts';

/**
 * Narration for the SHA-512/t IV generation function (FIPS 180-4 §5.3.6): the shared SHA-2 recorder
 * narrates it like any SHA-2 run, so this replaces the intro, the first `init` step (where
 * H(0)″ = H(0) ⊕ a5a5…a5 is formed) and the `output` step (the result is an IV, not a hash value).
 */
/** `ref`'s params under `key`, plus `extra`; drops `algorithm` (the replacement texts name the generator themselves). */
function renarrate(ref: I18nRef | undefined, key: string, extra: Record<string, string | number> = {}): I18nRef {
  const { algorithm: _algorithm, ...params } = ref?.params ?? {};
  return i18nRef(key, { ...params, ...extra });
}

export function explainIvGeneration(ns: string, recording: PrimitiveRecording): PrimitiveRecording {
  const state = recording.facets.state as AnyStateFacet;
  const firstInit = state.steps.findIndex((step) => step.op === 'init');
  const output = state.steps.length - 1;
  const xor = { base: wordsHex(WORD64, SHA512_IV), mask: WORD64.toHex(SHA512_T_IV_MASK) };
  const steps = state.steps.map((step, index) => {
    if (index === firstInit) return { ...step, narration: renarrate(step.narration, `${ns}.step.initFirstIvGeneration`, xor) };
    if (index === output) return { ...step, narration: renarrate(step.narration, `${ns}.step.outputIvGeneration`) };
    return step;
  });
  const explained: AnyStateFacet = { ...state, initialNarration: renarrate(state.initialNarration, `${ns}.step.initialIvGeneration`), steps };
  return { ...recording, facets: { ...recording.facets, state: explained, narration: narrationFromState(explained) } };
}
