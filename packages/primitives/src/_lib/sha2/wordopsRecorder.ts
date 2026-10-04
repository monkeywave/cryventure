import { RecordingTracer, type I18nRef, type RegionSpec, type ScopeLevel, type Snapshot, type StateFacet, type StepInput, type WordBits, type WordopsFacet, type WordopsStep } from '@cryventure/core';

/** The wordops half of one recorded step. */
export type WordopsContent = Omit<WordopsStep, 'step'>;

/**
 * Records state steps and, where given, a wordops step at the same index (the word-size
 * counterpart of core's `PairedRecorder` and of GHASH's `FieldPairedRecorder`). Every step sits
 * in its own child scope at the current level (`op` under `block` for SHA-2).
 */
export class WordopsRecorder<R extends string, Op extends { op: string }> {
  private readonly tracer: RecordingTracer<R, Op>;
  private readonly wordopsSteps: WordopsStep[] = [];

  constructor(
    regions: RegionSpec<R>[],
    initial: Snapshot<R>,
    private readonly levels: ScopeLevel[],
    initialNarration: I18nRef,
  ) {
    this.tracer = new RecordingTracer<R, Op>(regions, initial, { initialNarration });
  }

  enter(scopeIndex?: number): void {
    this.tracer.enter(scopeIndex);
  }

  leave(): void {
    this.tracer.leave();
  }

  /** Records one step in its own child scope (plus its wordops step, if any) and returns its step index. */
  op(input: StepInput<R, Op>, wordops?: WordopsContent): number {
    this.tracer.enter();
    this.tracer.step(input);
    this.tracer.leave();
    const index = this.tracer.stepCount - 1;
    if (wordops !== undefined) this.wordopsSteps.push({ step: index, ...wordops });
    return index;
  }

  stateFacet(): StateFacet<R, Op> {
    return { ...this.tracer.toFacet(), scopeLevels: this.levels };
  }

  wordopsFacet(wordBits: WordBits, registerNames?: readonly string[]): WordopsFacet {
    return { kind: 'wordops', schemaVersion: 1, wordBits, ...(registerNames === undefined ? {} : { registerNames: [...registerNames] }), steps: [...this.wordopsSteps] };
  }
}
