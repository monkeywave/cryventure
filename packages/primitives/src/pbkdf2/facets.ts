import { i18nRef, INITIAL_STEP_INDEX, toHex, valueId, valueRef, type DerivationFacet, type DerivationNode, type LabZoom, type ValuesFacet } from '@cryventure/core';
import { saltWithIndex } from './pbkdf2.ts';
import { LEADING_ITERATIONS, type Pbkdf2Recording, type RecordedBlock, type RecordedU } from './record.ts';

/** The `values` and `derivation` facets of a recorded PBKDF2 run (docs/M7.md §2e). */
const NS = 'plugin.pbkdf2';

/** The `hmac` lab takes keys and messages up to this many bytes; longer calls get no zoom link. */
export const HMAC_LAB_MAX_BYTES = 256;

export const PASSWORD_ID = valueId([], 'password');
export const SALT_ID = valueId([], 'salt');
export const DK_ID = valueId([], 'dk');
export const blockValueId = (index: number): string => valueId([index], 't');
const messageNodeId = (index: number): string => valueId([index], 'message');
export const uNodeId = (index: number, j: number): string => valueId([index], `u${j}`);

/** Password (secret) and salt from the start, T_i at its block step, DK (secret) at the output step. */
export function pbkdf2Values(recording: Pbkdf2Recording, password: number[], salt: number[]): ValuesFacet {
  return {
    kind: 'values',
    schemaVersion: 1,
    values: [
      valueRef(NS, 'password', 'secret', password, INITIAL_STEP_INDEX),
      valueRef(NS, 'salt', 'public', salt, INITIAL_STEP_INDEX),
      ...recording.blocks.map((block) => valueRef(NS, 't', 'secret', block.t, block.step, [block.index])),
      valueRef(NS, 'dk', 'secret', recording.dk, recording.outputStep),
    ],
  };
}

/** Where the derivation's HMAC calls come from: the Hash member behind the Mac, the password, the salt. */
export interface DerivationInput {
  /** The Mac member's `construction.hash`, e.g. `sha256:sha-256`. */
  hashRef: string;
  password: number[];
  salt: number[];
}

/** The `hmac` lab computing U₁ = HMAC(P, S ‖ INT(i)), or `undefined` past the lab's limits. */
export function u1Zoom(hashRef: string, password: readonly number[], message: readonly number[]): LabZoom | undefined {
  if (password.length > HMAC_LAB_MAX_BYTES || message.length > HMAC_LAB_MAX_BYTES) return undefined;
  return { producerId: 'hmac', params: { hash: hashRef, key: toHex(password), encoding: 'hex', input: toHex(message), tagLength: 'full', expected: '' } };
}

function uNode(block: RecordedBlock, u: RecordedU, previous: string, zoom: LabZoom | undefined): DerivationNode {
  const label = u.skipped ? i18nRef(`${NS}.derivation.uSkipped`, { j: u.j, hidden: u.j - LEADING_ITERATIONS }) : i18nRef(`${NS}.derivation.u`, { j: u.j, block: block.index });
  return { id: uNodeId(block.index, u.j), label, bytes: u.bytes, op: 'hmac', inputs: [previous, PASSWORD_ID], step: u.step, ...(zoom === undefined ? {} : { zoom }) };
}

/** S ‖ INT(i) → U₁ → … → U_c (recorded ones) → T_i = U₁ ⊕ … ⊕ U_c, the last U continuing the chain. */
function blockNodes(input: DerivationInput, block: RecordedBlock): DerivationNode[] {
  const message = Array.from(saltWithIndex(Uint8Array.from(input.salt), block.index));
  const nodes: DerivationNode[] = [{ id: messageNodeId(block.index), label: i18nRef(`${NS}.derivation.message`, { block: block.index }), bytes: message, op: 'concat', inputs: [SALT_ID] }];
  for (const u of block.us) {
    const previous = nodes.at(-1)!.id;
    nodes.push(uNode(block, u, previous, u.j === 1 ? u1Zoom(input.hashRef, input.password, message) : undefined));
  }
  const uIds = block.us.map((u) => uNodeId(block.index, u.j));
  nodes.push({
    id: blockValueId(block.index),
    label: i18nRef(`${NS}.derivation.t`, { block: block.index }),
    bytes: block.t,
    op: 'xor',
    inputs: [uIds.at(-1)!, ...uIds.slice(0, -1)],
    group: block.index,
    result: true,
    valueRef: blockValueId(block.index),
    step: block.step,
  });
  return nodes;
}

/** Password and salt, every block's U chain, then DK = T₁ ‖ … ‖ T_l (truncated to dkLen). */
export function pbkdf2Derivation(recording: Pbkdf2Recording, input: DerivationInput): DerivationFacet {
  const inputs: DerivationNode[] = [
    { id: PASSWORD_ID, label: i18nRef(`${NS}.derivation.password`), bytes: input.password, op: 'input', inputs: [], valueRef: PASSWORD_ID },
    { id: SALT_ID, label: i18nRef(`${NS}.derivation.salt`), bytes: input.salt, op: 'input', inputs: [], valueRef: SALT_ID },
  ];
  const dk: DerivationNode = {
    id: DK_ID,
    label: i18nRef(`${NS}.derivation.dk`, { length: recording.dk.length }),
    bytes: recording.dk,
    op: 'concat',
    inputs: recording.blocks.map((block) => blockValueId(block.index)),
    result: true,
    valueRef: DK_ID,
    step: recording.outputStep,
  };
  return {
    kind: 'derivation',
    schemaVersion: 1,
    title: i18nRef(`${NS}.derivation.title`),
    nodes: [...inputs, ...recording.blocks.flatMap((block) => blockNodes(input, block)), dk],
    groups: recording.blocks.map((block) => ({ id: block.index, label: i18nRef(`${NS}.derivation.group`, { block: block.index }) })),
  };
}
