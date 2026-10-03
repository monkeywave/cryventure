import type { I18nRef } from '../i18n.ts';
import type { RegionSpec, Snapshot, StateFacet } from '../facets/state.ts';
import { RecordingTracer, type StepInput } from '../tracer.ts';

/**
 * Records a block-wise trace with the scope levels block → op (the traced modes of operation,
 * docs/M3.md §4): `block(i, body)` opens block i, and every `op(step)` is its own scope below it.
 */
export class BlockOpRecorder<R extends string, Op extends { op: string }> {
  private readonly tracer: RecordingTracer<R, Op>;

  constructor(regions: RegionSpec<R>[], initial: Snapshot<R>, initialNarration: I18nRef) {
    this.tracer = new RecordingTracer<R, Op>(regions, initial, { initialNarration });
  }

  /** Runs `body` inside the scope of block `index` and returns its result. */
  block<T>(index: number, body: () => T): T {
    this.tracer.enter(index);
    try {
      return body();
    } finally {
      this.tracer.leave();
    }
  }

  /** Records `step` as the next op of the current block and returns its step index. */
  op(step: StepInput<R, Op>): number {
    this.tracer.enter();
    this.tracer.step(step);
    this.tracer.leave();
    return this.tracer.stepCount - 1;
  }

  /**
   * Records `step` outside every block (root scope `[]`), e.g. the PKCS#7 pad step that prepares the
   * whole input before the first block. Call it while no block is open.
   */
  topLevelOp(step: StepInput<R, Op>): number {
    this.tracer.step(step);
    return this.tracer.stepCount - 1;
  }

  toFacet(): StateFacet<R, Op> {
    return this.tracer.toFacet();
  }
}
