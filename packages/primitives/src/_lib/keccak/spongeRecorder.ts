import type { I18nRef, SpongeFacet, SpongeStep, StepInput } from '@cryventure/core';
import { ScopedPairedRecorder } from '../hashKit/scopedPairedRecorder.ts';
import { KECCAK_LANES, KECCAK_ROUNDS, KECCAK_WIDTH, PI_SOURCE, RHO_OFFSETS } from './constants.ts';

/** The sponge half of one recorded step (its `step` index is filled in). */
export type SpongeContent = Omit<SpongeStep, 'step'>;

/**
 * Records state steps and, for each that touches the state, a `sponge` step at the same index (the `sha3` and `kmac`
 * recordings; regions `R`, op names `O`). Scopes: `scope(i)` opens a block, a round inside it (detail
 * `mapping`, scope index = the round number i_r); `scopedOp` puts a step in its own child scope (the
 * `op` level), `step` records it directly in the current scope (the block-level steps such as `pad`,
 * `absorb`, `squeeze` and `output` at detail `mapping`, whose scope has no round).
 */
export class SpongeRecorder<R extends string, O extends string> extends ScopedPairedRecorder<R, { op: O }, SpongeStep> {
  /** Records a step in its own child scope (with its sponge step, if the step touches the state); returns its step index. */
  scopedOp(input: StepInput<R, { op: O }>, sponge?: SpongeContent): number {
    return this.scope(undefined, () => this.step(input, sponge));
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
      steps: this.pairedSteps(),
    };
  }
}
