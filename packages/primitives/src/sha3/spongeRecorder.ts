import { RecordingTracer, type I18nRef, type RegionSpec, type ScopeLevel, type Snapshot, type SpongeFacet, type SpongeStep, type StateFacet, type StepInput } from '@cryventure/core';
import { KECCAK_LANES, KECCAK_ROUNDS, KECCAK_WIDTH, PI_SOURCE, RHO_OFFSETS } from '../_lib/keccak/constants.ts';
import type { Sha3OpName } from '../_lib/keccak/manifestKit.ts';
import type { Sha3Region } from './regions.ts';

/** The sponge half of one recorded step (its `step` index is filled in). */
export type SpongeContent = Omit<SpongeStep, 'step'>;

type Op = { op: Sha3OpName };

/**
 * Records state steps and, for each, a `sponge` step at the same index. Scopes: `block(i)` opens a
 * block, `round(r)` a round inside it (detail `mapping`); `scopedOp` puts a step in its own child
 * scope (the `op` level), `flatOp` records it directly in the current scope (the block-level steps
 * `pad`, `absorb`, `squeeze` and `output` at detail `mapping`, whose scope has no round).
 */
export class SpongeRecorder {
  private readonly tracer: RecordingTracer<Sha3Region, Op>;
  private readonly spongeSteps: SpongeStep[] = [];

  constructor(
    regions: RegionSpec<Sha3Region>[],
    initial: Snapshot<Sha3Region>,
    private readonly levels: ScopeLevel[],
    initialNarration: I18nRef,
  ) {
    this.tracer = new RecordingTracer<Sha3Region, Op>(regions, initial, { initialNarration });
  }

  /** Runs `body` inside the scope of block `index`. */
  block<T>(index: number, body: () => T): T {
    return this.scoped(index, body);
  }

  /** Runs `body` inside the scope of round `round` (scope index = the round number i_r). */
  round<T>(round: number, body: () => T): T {
    return this.scoped(round, body);
  }

  /** Records a step in its own child scope; returns its step index. */
  scopedOp(input: StepInput<Sha3Region, Op>, sponge: SpongeContent): number {
    return this.scoped(undefined, () => this.flatOp(input, sponge));
  }

  /** Records a step in the current scope; returns its step index. */
  flatOp(input: StepInput<Sha3Region, Op>, sponge: SpongeContent): number {
    this.tracer.step(input);
    const step = this.tracer.stepCount - 1;
    this.spongeSteps.push({ step, ...sponge });
    return step;
  }

  stateFacet(): StateFacet<Sha3Region, Op> {
    return { ...this.tracer.toFacet(), scopeLevels: this.levels };
  }

  /** The `sponge` facet of Keccak-f[1600] with `rateLanes` rate lanes. */
  spongeFacet(label: I18nRef, rateLanes: number): SpongeFacet {
    return {
      kind: 'sponge',
      schemaVersion: 1,
      label,
      width: KECCAK_WIDTH,
      height: KECCAK_LANES / KECCAK_WIDTH,
      laneBits: 64,
      rounds: KECCAK_ROUNDS,
      rateLanes,
      rhoOffsets: [...RHO_OFFSETS],
      piSource: [...PI_SOURCE],
      steps: [...this.spongeSteps],
    };
  }

  private scoped<T>(index: number | undefined, body: () => T): T {
    this.tracer.enter(index);
    try {
      return body();
    } finally {
      this.tracer.leave();
    }
  }
}
