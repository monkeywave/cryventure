import type { SpongeStep } from '@cryventure/core';
import type { IsaFacets } from '../../fixtures/isaChecks.ts';
import type { KeccakListingInstruction, KeccakListingRole } from '../../listing.ts';
import type { KeccakMachine } from '../keccakDerivation.ts';
import type { KeccakPermutation, KeccakRoundPhase } from '../keccakTrace.ts';
import { KeccakRegisterFile, type KeccakRegister } from '../keccakValues.ts';

/** Test-only helpers for the Keccak ISA deriver tests. */

/**
 * The register contents after each instruction, replayed in listing order (a playhead replay would
 * also apply later writes on the same step, e.g. the epilogue's `zip1` reusing v0 after its `stp`).
 * An instruction owns the next registers step when that step writes exactly its destination
 * registers on the same span; register writes without a step (the callee-saved restores) keep the
 * old bytes.
 */
export function registersAfterEach(facets: IsaFacets): Map<string, number[]>[] {
  const steps = facets.registers.steps;
  const contents = new Map<string, number[]>();
  let next = 0;
  return facets.instructions.instructions.map((instruction) => {
    const step = steps[next];
    const targets = instruction.writes.flatMap((ref) => (ref.kind === 'reg' ? [ref.name] : []));
    const owns =
      step !== undefined &&
      targets.length > 0 &&
      step.align.first === instruction.align.first &&
      step.align.last === instruction.align.last &&
      step.writes.map((write) => write.reg).join() === targets.join();
    if (owns) {
      step.writes.forEach((write) => contents.set(write.reg, write.bytes));
      next += 1;
    }
    return new Map(contents);
  });
}

/**
 * A synthetic permutation whose steps sit at `entry` + 1 … (θ, ρ, π, χ, ι per round, five steps a
 * round) with empty lanes: enough for semantics and spans, which only use the step numbers.
 */
export function syntheticPermutation(rounds = 24, entry = 1): KeccakPermutation {
  const step = (phase: KeccakRoundPhase, round: number, offset: number): SpongeStep => ({
    step: entry + 1 + 5 * round + offset,
    phase,
    round,
    lanes: [],
  });
  return {
    entry,
    rounds: Array.from({ length: rounds }, (_, round) => ({
      theta: step('theta', round, 0),
      rho: step('rho', round, 1),
      pi: step('pi', round, 2),
      chi: step('chi', round, 3),
      iota: step('iota', round, 4),
    })),
    exit: entry + 1 + 5 * rounds,
  };
}

/** FIPS 202 ρ offsets and π sources (per lane index), as the sha3 producer emits them. */
export const RHO_OFFSETS = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14,
];
export const PI_SOURCE = [
  0, 6, 12, 18, 24, 3, 9, 10, 16, 22, 1, 7, 13, 19, 20, 4, 5, 11, 17, 23, 2, 8, 14, 15, 21,
];

/** A machine in `round` of a synthetic permutation whose registers (and stack) hold `contents`. */
export function keccakMachine(
  contents: Record<string, KeccakRegister>,
  round?: number,
  stack: Record<number, KeccakRegister> = {},
): KeccakMachine & { file: KeccakRegisterFile } {
  const file = new KeccakRegisterFile();
  Object.entries(contents).forEach(([name, content]) => file.write(name, content));
  Object.entries(stack).forEach(([offset, content]) => file.writeStack(Number(offset), content));
  return {
    registers: file,
    file,
    trace: { rhoOffsets: RHO_OFFSETS, piSource: PI_SOURCE },
    permutation: syntheticPermutation(),
    round,
  };
}

/** A listed instruction at address 0x0. */
export function listedKeccak(
  mnemonic: string,
  operands: string[],
  role: KeccakListingRole = 'other',
  extra: Partial<KeccakListingInstruction> = {},
): KeccakListingInstruction {
  return { address: '0x0', mnemonic, operands, role, ...extra };
}
