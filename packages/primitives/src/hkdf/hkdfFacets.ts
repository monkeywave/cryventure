import {
  i18nRef,
  INITIAL_STEP_INDEX,
  valueId,
  valueRef,
  type DerivationFacet,
  type DerivationNode,
  type ValueRef,
  type ValueRole,
  type ValuesFacet,
} from '@cryventure/core';
import { macLabZoom } from '../_lib/hmac/labZoom.ts';
import { expands, extracts, type HkdfRecording, type HkdfRun } from './hkdfTrace.ts';

/** The values and derivation facets of an HKDF recording (docs/M7.md §2d). */
const NS = 'plugin.hkdf';

const tId = (n: number) => `t${n}`;
/** The values-facet id of T(n): `n/t`. */
const tValueId = (n: number) => valueId([n], 't');

/** Values in creation order; empty byte strings are omitted (as the hash producers do). */
export function hkdfValues(run: HkdfRun, recording: HkdfRecording): ValuesFacet {
  const values: ValueRef[] = [];
  const add = (name: string, role: ValueRole, bytes: number[], createdAt: number) => {
    if (bytes.length > 0) values.push(valueRef(NS, name, role, bytes, createdAt));
  };
  if (extracts(run.mode)) {
    add('ikm', 'secret', run.ikm, INITIAL_STEP_INDEX);
    add('salt', 'public', recording.salt, INITIAL_STEP_INDEX);
  }
  if (run.mode === 'expand-label') add('context', 'public', run.context, INITIAL_STEP_INDEX);
  else if (expands(run.mode)) add('info', 'public', run.info, INITIAL_STEP_INDEX);
  add('prk', 'secret', recording.prk, recording.prkStep);
  if (recording.label !== undefined)
    add('hkdfLabel', 'public', recording.label.bytes, recording.label.step);
  recording.blocks.forEach((block) =>
    values.push(valueRef(NS, 't', 'secret', block.t, block.step, [block.index])),
  );
  if (expands(run.mode)) add('okm', 'secret', recording.okm, recording.okmStep);
  return { kind: 'values', schemaVersion: 1, values };
}

const label = (name: string, params?: Record<string, string | number>) =>
  i18nRef(`${NS}.node.${name}`, params);

type Node = DerivationNode;
const input = (id: string, bytes: number[], valueRefId?: string): Node => ({
  id,
  label: label(id),
  bytes,
  op: 'input',
  inputs: [],
  ...(valueRefId === undefined ? {} : { valueRef: valueRefId }),
});
const withZoom = (node: Node, zoom: ReturnType<typeof macLabZoom>): Node =>
  zoom === undefined ? node : { ...node, zoom };

/** IKM, salt → PRK = HMAC(salt, IKM): the chain continues from IKM, the salt is the key operand. */
function extractNodes(run: HkdfRun, recording: HkdfRecording): Node[] {
  const prk: Node = {
    id: 'prk',
    label: label('prk'),
    bytes: recording.prk,
    op: 'hmac',
    inputs: ['ikm', 'salt'],
    result: true,
    valueRef: 'prk',
    step: recording.prkStep,
  };
  return [
    input('ikm', run.ikm, run.ikm.length > 0 ? 'ikm' : undefined),
    input('salt', recording.salt, 'salt'),
    withZoom(prk, macLabZoom(run.mac, recording.salt, run.ikm)),
  ];
}

/** The info Expand uses: the `info` input, or "tls13 " ‖ label and the context → HkdfLabel. Empty info has no node. */
function infoNodes(run: HkdfRun, recording: HkdfRecording): { nodes: Node[]; infoId?: string } {
  const struct = recording.label;
  if (struct === undefined)
    return run.info.length === 0
      ? { nodes: [] }
      : { nodes: [input('info', run.info, 'info')], infoId: 'info' };
  const context = struct.context.length > 0 ? [input('context', struct.context, 'context')] : [];
  const hkdfLabel: Node = {
    id: 'hkdfLabel',
    label: label('hkdfLabel'),
    bytes: struct.bytes,
    op: 'hkdfLabel',
    inputs: ['label', ...context.map((node) => node.id)],
    valueRef: 'hkdfLabel',
    step: struct.step,
  };
  return { nodes: [input('label', struct.fullLabel), ...context, hkdfLabel], infoId: 'hkdfLabel' };
}

/** Per block: counter i, message T(i−1) ‖ info ‖ i, then T(i) = HMAC(PRK, message) (zoom into the `hmac` lab). */
function expandNodes(run: HkdfRun, recording: HkdfRecording, infoId: string | undefined): Node[] {
  return recording.blocks.flatMap((block) => {
    const n = block.index;
    const counter: Node = {
      id: `counter${n}`,
      label: label('counter', { n }),
      bytes: [n],
      op: 'counter',
      inputs: [],
    };
    const messageInputs = [
      ...(n > 1 ? [tId(n - 1)] : []),
      ...(infoId === undefined ? [] : [infoId]),
      counter.id,
    ];
    const message: Node = {
      id: `message${n}`,
      label: label('message', { n }),
      bytes: block.message,
      op: 'concat',
      inputs: messageInputs,
    };
    const t: Node = {
      id: tId(n),
      label: label('t', { n }),
      bytes: block.t,
      op: 'hmac',
      inputs: [message.id, 'prk'],
      result: true,
      valueRef: tValueId(n),
      step: block.step,
    };
    return [counter, message, withZoom(t, macLabZoom(run.mac, recording.prk, block.message))];
  });
}

function okmNode(run: HkdfRun, recording: HkdfRecording): Node {
  const truncated = recording.blocks.length * run.mac.outputSize > run.length;
  return {
    id: 'okm',
    label: label('okm'),
    bytes: recording.okm,
    op: truncated ? 'truncate' : 'concat',
    inputs: recording.blocks.map((block) => tId(block.index)),
    result: true,
    valueRef: 'okm',
    step: recording.okmStep,
  };
}

/** PRK, each T(i) and OKM are results; inputs, counters and messages are intermediates. Topologically ordered. */
export function hkdfDerivation(run: HkdfRun, recording: HkdfRecording): DerivationFacet {
  const nodes: Node[] = extracts(run.mode)
    ? extractNodes(run, recording)
    : [input('prk', run.prk, 'prk')];
  if (expands(run.mode)) {
    const info = infoNodes(run, recording);
    nodes.push(...info.nodes, ...expandNodes(run, recording, info.infoId), okmNode(run, recording));
  }
  return { kind: 'derivation', schemaVersion: 1, nodes, title: i18nRef(`${NS}.derivation.title`) };
}
