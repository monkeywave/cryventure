import { RecordingTracer, type I18nRef, type RegionSpec, type ScopeLevel, type Snapshot, type StateFacet, type StepInput, type WordBits, type WordopsFacet, type WordopsStep } from '@cryventure/core';
import type { Blake2OpName } from '../_lib/blake2/manifestKit.ts';
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
export class Blake2Recorder {
  private readonly tracer: RecordingTracer<Blake2Region, { op: Blake2OpName }>;
  private readonly wordopsSteps: WordopsStep[] = [];

  constructor(regions: RegionSpec<Blake2Region>[], initial: Snapshot<Blake2Region>, initialNarration: I18nRef) {
    this.tracer = new RecordingTracer(regions, initial, { initialNarration });
  }

  /** Runs `body` inside child scope `index` of the current scope and returns its result. */
  scope<T>(index: number, body: () => T): T {
    this.tracer.enter(index);
    try {
      return body();
    } finally {
      this.tracer.leave();
    }
  }

  /** Records one step in the current scope (plus its wordops step, if any) and returns its step index. */
  step(input: Blake2StepInput, wordops?: Blake2Wordops): number {
    this.tracer.step(input);
    const index = this.tracer.stepCount - 1;
    if (wordops !== undefined) this.wordopsSteps.push({ step: index, ...wordops });
    return index;
  }

  stateFacet(levels: ScopeLevel[]): StateFacet<Blake2Region, { op: Blake2OpName }> {
    return { ...this.tracer.toFacet(), scopeLevels: levels };
  }

  wordopsFacet(wordBits: WordBits): WordopsFacet {
    return { kind: 'wordops', schemaVersion: 2, wordBits, registerNames: [...V_REGISTER_NAMES], registerColumns: REGISTER_COLUMNS, steps: [...this.wordopsSteps] };
  }
}
