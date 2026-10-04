import { RecordingTracer, type I18nRef, type RegionSpec, type ScopeLevel, type Snapshot, type StateFacet, type StepInput } from '@cryventure/core';

/**
 * Records state steps and, where given, a paired facet step (wordops, sponge, …) at the same index,
 * with explicit scopes: `scope(index, body)` opens a child scope of the current one and `step()`
 * records into the current scope. Shared by the BLAKE2 and sha3 recorders, whose steps sit at
 * different scope depths (block-level steps directly in their block, the others deeper).
 */
export class ScopedPairedRecorder<R extends string, Op extends { op: string }, P extends { step: number }> {
  private readonly tracer: RecordingTracer<R, Op>;
  private readonly paired: P[] = [];

  constructor(regions: RegionSpec<R>[], initial: Snapshot<R>, initialNarration: I18nRef) {
    this.tracer = new RecordingTracer<R, Op>(regions, initial, { initialNarration });
  }

  /** Runs `body` inside child scope `index` of the current scope (auto-numbered when undefined) and returns its result. */
  scope<T>(index: number | undefined, body: () => T): T {
    this.tracer.enter(index);
    try {
      return body();
    } finally {
      this.tracer.leave();
    }
  }

  /** Records one step in the current scope (plus its paired step, if any) and returns its step index. */
  step(input: StepInput<R, Op>, paired?: Omit<P, 'step'>): number {
    this.tracer.step(input);
    const step = this.tracer.stepCount - 1;
    if (paired !== undefined) this.paired.push({ step, ...paired } as P);
    return step;
  }

  stateFacet(levels: ScopeLevel[]): StateFacet<R, Op> {
    return { ...this.tracer.toFacet(), scopeLevels: levels };
  }

  /** The paired steps recorded so far, in step order. */
  protected pairedSteps(): P[] {
    return [...this.paired];
  }
}
