import { i18nRef, INITIAL_STEP_INDEX, valueId, valueRef, type DerivationFacet, type ValuesFacet } from '@cryventure/core';
import { DerivationBuilder, type DerivationNodeSpec } from '../_lib/derivation.ts';
import { macLabZoom } from '../_lib/hmac/labZoom.ts';
import { saltWithIndex } from './pbkdf2.ts';
import { LEADING_ITERATIONS, type Pbkdf2Input, type Pbkdf2Recording, type RecordedBlock } from './record.ts';

/** The `values` and `derivation` facets of a recorded PBKDF2 run (docs/M7.md §2e). */
const NS = 'plugin.pbkdf2';

export const PASSWORD_ID = valueId([], 'password');
export const SALT_ID = valueId([], 'salt');
export const DK_ID = valueId([], 'dk');
export const blockValueId = (index: number): string => valueId([index], 't');
const messageNodeId = (index: number): string => valueId([index], 'message');
export const uNodeId = (index: number, j: number): string => valueId([index], `u${j}`);

/** Password (secret) and salt from the start, T_i at its block step, DK (secret) at the output step. */
export function pbkdf2Values(recording: Pbkdf2Recording, input: Pick<Pbkdf2Input, 'password' | 'salt'>): ValuesFacet {
  return {
    kind: 'values',
    schemaVersion: 1,
    values: [
      valueRef(NS, 'password', 'secret', input.password, INITIAL_STEP_INDEX),
      valueRef(NS, 'salt', 'public', input.salt, INITIAL_STEP_INDEX),
      ...recording.blocks.map((block) => valueRef(NS, 't', 'secret', block.t, block.step, [block.index])),
      valueRef(NS, 'dk', 'secret', recording.dk, recording.outputStep),
    ],
  };
}

type DerivationSource = Pick<Pbkdf2Input, 'mac' | 'password' | 'salt'>;

/** S ‖ INT(i) → U₁ → … → U_c (recorded ones) → T_i = U₁ ⊕ … ⊕ U_c, the last U continuing the chain; U₁ links to the `hmac` lab. */
function addBlockNodes(builder: DerivationBuilder, input: DerivationSource, block: RecordedBlock): void {
  const message = saltWithIndex(Uint8Array.from(input.salt), block.index);
  let previous = builder.add({ id: messageNodeId(block.index), label: 'message', labelParams: { block: block.index }, bytes: message, op: 'concat', inputs: [SALT_ID] });
  for (const u of block.us) {
    const label: Pick<DerivationNodeSpec, 'label' | 'labelParams'> = u.skipped ? { label: 'uSkipped', labelParams: { j: u.j, hidden: u.j - LEADING_ITERATIONS } } : { label: 'u', labelParams: { j: u.j, block: block.index } };
    const zoom = u.j === 1 ? macLabZoom(input.mac, input.password, message) : undefined;
    previous = builder.add({ id: uNodeId(block.index, u.j), ...label, bytes: u.bytes, op: 'hmac', inputs: [previous, PASSWORD_ID], step: u.step, zoom });
  }
  const uIds = block.us.map((u) => uNodeId(block.index, u.j));
  const tId = blockValueId(block.index);
  builder.add({ id: tId, label: 't', labelParams: { block: block.index }, bytes: block.t, op: 'xor', inputs: [uIds.at(-1)!, ...uIds.slice(0, -1)], group: block.index, result: true, valueRef: tId, step: block.step });
}

/** Password and salt, every block's U chain, then DK = T₁ ‖ … ‖ T_l (truncated to dkLen). */
export function pbkdf2Derivation(recording: Pbkdf2Recording, input: DerivationSource): DerivationFacet {
  const builder = new DerivationBuilder(NS);
  builder.add({ id: PASSWORD_ID, label: 'password', bytes: input.password, op: 'input', valueRef: PASSWORD_ID });
  builder.add({ id: SALT_ID, label: 'salt', bytes: input.salt, op: 'input', valueRef: SALT_ID });
  for (const block of recording.blocks) addBlockNodes(builder, input, block);
  const dkInputs = recording.blocks.map((block) => blockValueId(block.index));
  builder.add({ id: DK_ID, label: 'dk', labelParams: { length: recording.dk.length }, bytes: recording.dk, op: 'concat', inputs: dkInputs, result: true, valueRef: DK_ID, step: recording.outputStep });
  return builder.facet(recording.blocks.map((block) => ({ id: block.index, label: i18nRef(`${NS}.derivation.group`, { block: block.index }) })));
}
