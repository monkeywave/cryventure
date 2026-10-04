import type { StepInput, WordBits, WordopsFacet, WordopsStep } from '@cryventure/core';
import type { Blake2OpName } from '../_lib/blake2/manifestKit.ts';
import { ScopedPairedRecorder } from '../_lib/hashKit/scopedPairedRecorder.ts';
import type { Blake2Region } from './regions.ts';

/** The wordops half of one recorded step. */
export type Blake2Wordops = Omit<WordopsStep, 'step'>;
export type Blake2StepInput = StepInput<Blake2Region, { op: Blake2OpName }>;

/** v0 … v15, the working vector as a 4 × 4 matrix (RFC 7693 §3.2). */
export const V_REGISTER_NAMES: readonly string[] = Array.from({ length: 16 }, (_, index) => `v${index}`);
const REGISTER_COLUMNS = 4;

/**
 * Records state steps and, where given, a wordops (schema v2) step at the same index. Scopes are
 * explicit: `scope(index, body)` opens a child scope (block, round, or one G call) and `step()`
 * records into the current scope, so block-level steps (`load`, `feedForward`) sit directly in
 * their block and G calls at `[block, round, i]` (docs/M6.md §2d).
 */
export class Blake2Recorder extends ScopedPairedRecorder<Blake2Region, { op: Blake2OpName }, WordopsStep> {
  wordopsFacet(wordBits: WordBits): WordopsFacet {
    return { kind: 'wordops', schemaVersion: 2, wordBits, registerNames: [...V_REGISTER_NAMES], registerColumns: REGISTER_COLUMNS, steps: this.pairedSteps() };
  }
}
