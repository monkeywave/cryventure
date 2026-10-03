import {
  getFacet,
  stateAt,
  type AnyStateFacet,
  type TraceBundle,
  type ValueRole,
  type ValuesFacet,
} from '@cryventure/core';

/**
 * Reads the AES producer's **published facet contract** (docs/M4.md §1b), never its code:
 * regions `state` and `w`, ops `input`/`keyExpansion`/`addRoundKey`/`subBytes`/`shiftRows`/
 * `mixColumns`/`output` with `round`, and the values facet's `subkey` entries. A broken contract throws.
 */

export { AES_PRODUCER_ID, isAesOpBundle } from './applicability.ts';
export const AES_BLOCK_BYTES = 16;

/** The AES ops a deriver may align to. */
export const AES_OPS = [
  'input',
  'keyExpansion',
  'addRoundKey',
  'subBytes',
  'shiftRows',
  'mixColumns',
  'output',
] as const;
export type AesOpName = (typeof AES_OPS)[number];

/** Round counts Nr of AES-128/192/256. */
const AES_ROUND_COUNTS: readonly number[] = [10, 12, 14];

/** Where each AES op sits on the state timeline. */
export interface AesOpSteps {
  /** Nr: the round of the last SubBytes. */
  rounds: number;
  stepCount: number;
  /** First step index per `op:round`. */
  steps: ReadonlyMap<string, number>;
}

type AesStateStep = { op: string; round?: unknown };

function contractError(message: string): Error {
  return new Error(`AES trace contract: ${message}`);
}

function opKey(op: AesOpName, round: number): string {
  return `${op}:${round}`;
}

function isAesOpName(op: string): op is AesOpName {
  return (AES_OPS as readonly string[]).includes(op);
}

/** The bundle's state facet with the `state` and `w` regions; throws when the contract is broken. */
export function aesStateFacet(bundle: TraceBundle): AnyStateFacet {
  const facet = getFacet<AnyStateFacet>(bundle, 'state');
  if (facet === undefined) throw contractError('no state facet');
  for (const region of ['state', 'w']) {
    if (!facet.regions.some((spec) => spec.id === region))
      throw contractError(`no "${region}" region`);
  }
  return facet;
}

/** The bundle's values facet; throws when it is missing. */
export function aesValuesFacet(bundle: TraceBundle): ValuesFacet {
  const facet = getFacet<ValuesFacet>(bundle, 'values');
  if (facet === undefined) throw contractError('no values facet');
  return facet;
}

function stepRound(step: AesStateStep, index: number): number {
  if (typeof step.round !== 'number' || !Number.isInteger(step.round))
    throw contractError(`step ${index} (${step.op}) has no integer round`);
  return step.round;
}

function collectOpSteps(facet: AnyStateFacet): Map<string, number> {
  const steps = new Map<string, number>();
  facet.steps.forEach((step: AesStateStep, index) => {
    if (!isAesOpName(step.op)) return;
    const key = opKey(step.op, stepRound(step, index));
    if (!steps.has(key)) steps.set(key, index);
  });
  return steps;
}

function roundCount(steps: ReadonlyMap<string, number>): number {
  const rounds = AES_ROUND_COUNTS.filter(
    (nr) => steps.has(opKey('subBytes', nr)) && !steps.has(opKey('subBytes', nr + 1)),
  );
  const nr = rounds[0];
  if (nr === undefined) throw contractError('no final SubBytes round 10, 12 or 14');
  return nr;
}

/** Locates every AES op step per round (first match); throws when an op of the contract is missing. */
export function locateAesOps(facet: AnyStateFacet): AesOpSteps {
  const steps = collectOpSteps(facet);
  const located: AesOpSteps = { rounds: roundCount(steps), stepCount: facet.steps.length, steps };
  for (const op of ['input', 'keyExpansion', 'output'] as const)
    opStep(located, op, op === 'output' ? located.rounds : 0);
  return located;
}

/** Step index of `op` in `round`; throws when the trace has none. */
export function opStep(ops: AesOpSteps, op: AesOpName, round: number): number {
  const step = ops.steps.get(opKey(op, round));
  if (step === undefined) throw contractError(`no ${op} step in round ${round}`);
  return step;
}

function regionBytes(facet: AnyStateFacet, step: number, region: string, offset: number): number[] {
  const values = stateAt(facet, step)[region];
  const bytes = values?.slice(offset, offset + AES_BLOCK_BYTES);
  if (bytes?.length !== AES_BLOCK_BYTES)
    throw contractError(`region "${region}" has no 16 bytes at ${offset}`);
  return [...bytes];
}

/** The 16 state bytes (memory order) after `step`. */
export function stateBytesAt(facet: AnyStateFacet, step: number): number[] {
  return regionBytes(facet, step, 'state', 0);
}

/** Round key `index` (16 bytes) from the key schedule region `w` after `step`. */
export function roundKeyBytesAt(facet: AnyStateFacet, step: number, index: number): number[] {
  return regionBytes(facet, step, 'w', index * AES_BLOCK_BYTES);
}

function subkeyRound(id: string): number {
  const round = Number(id.split('/')[0]);
  if (!Number.isInteger(round) || round < 0)
    throw contractError(`subkey "${id}" has no round scope`);
  return round;
}

/** Subkey value ids by round, from the values facet's `subkey` entries (id scope = round). */
export function subkeyValueIds(values: ValuesFacet): Map<number, string> {
  const ids = new Map<number, string>();
  for (const value of values.values)
    if (value.role === 'subkey') ids.set(subkeyRound(value.id), value.id);
  return ids;
}

/** The subkey value id of round key `round`; throws when the values facet has none. */
export function requiredSubkeyId(subkeys: ReadonlyMap<number, string>, round: number): string {
  const id = subkeys.get(round);
  if (id === undefined) throw contractError(`no subkey value for round key ${round}`);
  return id;
}

/** Id of the first value with `role`, or `undefined`. */
export function valueIdByRole(values: ValuesFacet, role: ValueRole): string | undefined {
  return values.values.find((value) => value.role === role)?.id;
}
