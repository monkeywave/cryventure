import type { MathFacet, MathStep } from '../facets/math.ts';
import { INITIAL_STEP_INDEX } from '../facets/validation.ts';
import type { I18nRef } from '../i18n.ts';
import type { RegionSpec, ScopeLevel, Snapshot, StateFacet } from '../facets/state.ts';
import { AES_POLYNOMIAL } from '../math/gf256.ts';
import { RecordingTracer, type StepInput } from '../tracer.ts';

/** The math half of one recorded step. */
export type MathContent = Omit<MathStep, 'step'>;

/** Narration and math of the initial snapshot (step −1), e.g. the loaded operands. */
export interface InitialContent {
  narration: I18nRef;
  math: MathContent;
}

/**
 * Records state steps together with their math steps: every `step` emits one state step and one
 * math step at the same index, so the state and math facets stay aligned by construction. With
 * `initialContent`, the state facet gets an `initialNarration` and the math facet a step −1 entry.
 */
export class PairedRecorder<R extends string, Op extends { op: string }> {
  private readonly tracer: RecordingTracer<R, Op>;
  private readonly mathSteps: MathStep[] = [];

  constructor(
    regions: RegionSpec<R>[],
    initial: Snapshot<R>,
    private readonly levels: ScopeLevel[],
    initialContent?: InitialContent,
  ) {
    this.tracer = new RecordingTracer<R, Op>(regions, initial, initialContent === undefined ? {} : { initialNarration: initialContent.narration });
    if (initialContent !== undefined) this.mathSteps.push({ step: INITIAL_STEP_INDEX, ...initialContent.math });
  }

  /** Steps recorded so far (the next step's index). */
  get stepCount(): number {
    return this.tracer.stepCount;
  }

  enter(scopeIndex?: number): void {
    this.tracer.enter(scopeIndex);
  }

  leave(): void {
    this.tracer.leave();
  }

  step(input: StepInput<R, Op>, math: MathContent): void {
    this.tracer.step(input);
    this.mathSteps.push({ step: this.tracer.stepCount - 1, ...math });
  }

  /** One step in its own child scope (the next sibling at the current level). */
  scopedStep(input: StepInput<R, Op>, math: MathContent): void {
    this.enter();
    this.step(input, math);
    this.leave();
  }

  stateFacet(): StateFacet<R, Op> {
    return { ...this.tracer.toFacet(), scopeLevels: this.levels };
  }

  /** The math facet over GF(2⁸) with the given reduction polynomial (default: AES's {11b}). */
  mathFacet(modulus: number = AES_POLYNOMIAL): MathFacet {
    return { kind: 'math', schemaVersion: 1, notation: { field: 'gf2^8', modulus }, steps: [...this.mathSteps] };
  }
}
