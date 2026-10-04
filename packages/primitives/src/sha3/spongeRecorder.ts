import type { I18nRef, SpongeFacet, SpongeStep, StepInput } from '@cryventure/core';
import { ScopedPairedRecorder } from '../_lib/hashKit/scopedPairedRecorder.ts';
import { KECCAK_LANES, KECCAK_ROUNDS, KECCAK_WIDTH, PI_SOURCE, RHO_OFFSETS } from '../_lib/keccak/constants.ts';
import type { Sha3OpName } from '../_lib/keccak/manifestKit.ts';
import type { Sha3Region } from './regions.ts';

/** The sponge half of one recorded step (its `step` index is filled in). */
export type SpongeContent = Omit<SpongeStep, 'step'>;

type Op = { op: Sha3OpName };

/**
 * Records state steps and, for each, a `sponge` step at the same index. Scopes: `scope(i)` opens a
 * block, a round inside it (detail `mapping`, scope index = the round number i_r); `scopedOp` puts
 * a step in its own child scope (the `op` level), `step` records it directly in the current scope
 * (the block-level steps `pad`, `absorb`, `squeeze` and `output` at detail `mapping`, whose scope
 * has no round).
 */
export class SpongeRecorder extends ScopedPairedRecorder<Sha3Region, Op, SpongeStep> {
  /** Records a step in its own child scope; returns its step index. */
  scopedOp(input: StepInput<Sha3Region, Op>, sponge: SpongeContent): number {
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
