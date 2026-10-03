import {
  INITIAL_STEP_INDEX,
  RecordingTracer,
  type FieldFacet,
  type FieldStep,
  type I18nRef,
  type RegionSpec,
  type ScopeLevel,
  type Snapshot,
  type StateFacet,
  type StepInput,
} from '@cryventure/core';
import { GF128_FIELD_NOTATION } from '../_lib/fieldNotation.ts';

/** The field half of one recorded step. */
export type FieldContent = Omit<FieldStep, 'step'>;

/** Narration and field equation of the initial snapshot (step −1). */
export interface FieldInitialContent {
  narration: I18nRef;
  field: FieldContent;
}

/**
 * Records state steps and, where given, a field step at the same index (the GF(2¹²⁸) counterpart of
 * core's `PairedRecorder`, docs/M4.md §3e). The initial content becomes the state facet's
 * `initialNarration` and the field facet's step −1 entry. Unlike `PairedRecorder`, a state step may
 * have no field step (e.g. GHASH's xorBlock); `fieldStepAt` then shows the latest earlier one.
 */
export class FieldPairedRecorder<R extends string, Op extends { op: string }> {
  private readonly tracer: RecordingTracer<R, Op>;
  private readonly fieldSteps: FieldStep[];

  constructor(
    regions: RegionSpec<R>[],
    initial: Snapshot<R>,
    private readonly levels: ScopeLevel[],
    initialContent: FieldInitialContent,
  ) {
    this.tracer = new RecordingTracer<R, Op>(regions, initial, { initialNarration: initialContent.narration });
    this.fieldSteps = [{ step: INITIAL_STEP_INDEX, ...initialContent.field }];
  }

  enter(scopeIndex?: number): void {
    this.tracer.enter(scopeIndex);
  }

  leave(): void {
    this.tracer.leave();
  }

  /** Records one state step (plus its field step, if any) and returns its step index. */
  step(input: StepInput<R, Op>, field?: FieldContent): number {
    this.tracer.step(input);
    const index = this.tracer.stepCount - 1;
    if (field !== undefined) this.fieldSteps.push({ step: index, ...field });
    return index;
  }

  /** One step in its own child scope (the next sibling, or `scopeIndex`, at the current level). */
  scopedStep(input: StepInput<R, Op>, field?: FieldContent, scopeIndex?: number): number {
    this.enter(scopeIndex);
    try {
      return this.step(input, field);
    } finally {
      this.leave();
    }
  }

  stateFacet(): StateFacet<R, Op> {
    return { ...this.tracer.toFacet(), scopeLevels: this.levels };
  }

  fieldFacet(): FieldFacet {
    return {
      kind: 'field',
      schemaVersion: 1,
      notation: GF128_FIELD_NOTATION,
      steps: [...this.fieldSteps],
    };
  }
}
