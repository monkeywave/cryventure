import {
  i18nRef,
  INITIAL_STEP_INDEX,
  valueId,
  valueRef,
  type DerivationFacet,
  type ValueRef,
  type ValuesFacet,
} from '@cryventure/core';
import { DerivationBuilder } from '../_lib/derivation.ts';
import { macLabZoom } from '../_lib/hmac/labZoom.ts';
import { nonEmptyValueRef } from '../_lib/values.ts';
import { expands, extracts, type HkdfRecording, type HkdfRun } from './hkdfTrace.ts';

/** The values and derivation facets of an HKDF recording (docs/M7.md §2d). */
const NS = 'plugin.hkdf';

const tId = (n: number) => `t${n}`;
/** The values-facet id of T(n): `n/t`. */
const tValueId = (n: number) => valueId([n], 't');

/** Values in creation order; empty byte strings are omitted (as the hash producers do). */
export function hkdfValues(run: HkdfRun, recording: HkdfRecording): ValuesFacet {
  const values: ValueRef[] = [];
  if (extracts(run.mode)) {
    values.push(...nonEmptyValueRef(NS, 'ikm', 'secret', run.ikm, INITIAL_STEP_INDEX));
    values.push(...nonEmptyValueRef(NS, 'salt', 'public', recording.salt, INITIAL_STEP_INDEX));
  }
  if (run.mode === 'expand-label') values.push(...nonEmptyValueRef(NS, 'context', 'public', run.context, INITIAL_STEP_INDEX));
  else if (expands(run.mode)) values.push(...nonEmptyValueRef(NS, 'info', 'public', run.info, INITIAL_STEP_INDEX));
  values.push(...nonEmptyValueRef(NS, 'prk', 'secret', recording.prk, recording.prkStep));
  if (recording.label !== undefined) values.push(...nonEmptyValueRef(NS, 'hkdfLabel', 'public', recording.label.bytes, recording.label.step));
  recording.blocks.forEach((block) => values.push(valueRef(NS, 't', 'secret', block.t, block.step, [block.index])));
  if (expands(run.mode)) values.push(...nonEmptyValueRef(NS, 'okm', 'secret', recording.okm, recording.okmStep));
  return { kind: 'values', schemaVersion: 1, values };
}

/** An input node labelled `<ns>.node.<id>`, linked to the value `valueRefId` when given. */
function addInput(builder: DerivationBuilder, id: string, bytes: number[], valueRefId?: string): string {
  return builder.add({ id, label: id, bytes, op: 'input', valueRef: valueRefId });
}

/** IKM, salt → PRK = HMAC(salt, IKM): the chain continues from IKM, the salt is the key operand. */
function addExtractNodes(builder: DerivationBuilder, run: HkdfRun, recording: HkdfRecording): void {
  addInput(builder, 'ikm', run.ikm, run.ikm.length > 0 ? 'ikm' : undefined);
  addInput(builder, 'salt', recording.salt, 'salt');
  builder.add({ id: 'prk', label: 'prk', bytes: recording.prk, op: 'hmac', inputs: ['ikm', 'salt'], result: true, valueRef: 'prk', step: recording.prkStep, zoom: macLabZoom(run.mac, recording.salt, run.ikm) });
}

/** The info Expand uses: the `info` input, or "tls13 " ‖ label and the context → HkdfLabel. Empty info has no node; returns the info node id. */
function addInfoNodes(builder: DerivationBuilder, run: HkdfRun, recording: HkdfRecording): string | undefined {
  const struct = recording.label;
  if (struct === undefined) return run.info.length === 0 ? undefined : addInput(builder, 'info', run.info, 'info');
  const labelId = addInput(builder, 'label', struct.fullLabel);
  const contextIds = struct.context.length > 0 ? [addInput(builder, 'context', struct.context, 'context')] : [];
  return builder.add({ id: 'hkdfLabel', label: 'hkdfLabel', bytes: struct.bytes, op: 'hkdfLabel', inputs: [labelId, ...contextIds], valueRef: 'hkdfLabel', step: struct.step });
}

/** Per block: counter i, message T(i−1) ‖ info ‖ i, then T(i) = HMAC(PRK, message) (zoom into the `hmac` lab). */
function addExpandNodes(builder: DerivationBuilder, run: HkdfRun, recording: HkdfRecording, infoId: string | undefined): void {
  for (const block of recording.blocks) {
    const n = block.index;
    const counterId = builder.add({ id: `counter${n}`, label: 'counter', labelParams: { n }, bytes: [n], op: 'counter' });
    const messageInputs = [...(n > 1 ? [tId(n - 1)] : []), ...(infoId === undefined ? [] : [infoId]), counterId];
    const messageId = builder.add({ id: `message${n}`, label: 'message', labelParams: { n }, bytes: block.message, op: 'concat', inputs: messageInputs });
    builder.add({ id: tId(n), label: 't', labelParams: { n }, bytes: block.t, op: 'hmac', inputs: [messageId, 'prk'], result: true, valueRef: tValueId(n), step: block.step, zoom: macLabZoom(run.mac, recording.prk, block.message) });
  }
}

function addOkmNode(builder: DerivationBuilder, run: HkdfRun, recording: HkdfRecording): void {
  const truncated = recording.blocks.length * run.mac.outputSize > run.length;
  const inputs = recording.blocks.map((block) => tId(block.index));
  builder.add({ id: 'okm', label: 'okm', bytes: recording.okm, op: truncated ? 'truncate' : 'concat', inputs, result: true, valueRef: 'okm', step: recording.okmStep });
}

/** PRK, each T(i) and OKM are results; inputs, counters and messages are intermediates. Topologically ordered. */
export function hkdfDerivation(run: HkdfRun, recording: HkdfRecording): DerivationFacet {
  const builder = new DerivationBuilder(NS, 'node');
  if (extracts(run.mode)) addExtractNodes(builder, run, recording);
  else addInput(builder, 'prk', run.prk, 'prk');
  if (expands(run.mode)) {
    const infoId = addInfoNodes(builder, run, recording);
    addExpandNodes(builder, run, recording, infoId);
    addOkmNode(builder, run, recording);
  }
  // Node labels live under `<ns>.node.*`, the title under `<ns>.derivation.title` (not the builder's `node.title`).
  return { kind: 'derivation', schemaVersion: 1, nodes: builder.nodes, title: i18nRef(`${NS}.derivation.title`) };
}
