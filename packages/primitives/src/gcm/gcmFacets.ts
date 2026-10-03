import {
  addBlockSegment,
  blockSegmentId,
  ChainBuilder,
  chainLabel,
  cipherZoom,
  GF128_BYTES,
  i18nRef,
  INITIAL_STEP_INDEX,
  laneNodeId,
  laneNodes,
  valueRef,
  WireBuilder,
  type ChainFacet,
  type FieldFacet,
  type FieldStep,
  type I18nRef,
  type ValueRef,
  type ValuesFacet,
  type WireFacet,
} from '@cryventure/core';
import { GF128_FIELD_NOTATION } from '../_lib/fieldNotation.ts';
import { gcmCtrOutput, type GcmCtrBlock, type GcmRecording, type GhashTrace } from './gcmTrace.ts';

/** The values, chain, wire and field facets of a GCM recording (docs/M4.md §2b, §3e). */
const NS = 'plugin.gcm';

const label = (name: string, n?: number) => chainLabel(NS, name, n);

/** Whether the recording releases its GCTR output (always when encrypting; when decrypting only if authentic). */
export function releasesOutput(recording: Pick<GcmRecording, 'verify'>): boolean {
  return recording.verify?.authentic ?? true;
}

function optionalValue(name: string, role: ValueRef['role'], bytes: number[], createdAt: number): ValueRef[] {
  return bytes.length === 0 ? [] : [valueRef(NS, name, role, bytes, createdAt)];
}

/** Key, IV, AAD and input from the initial state; H, J0, S and the tag when computed; the output when released. */
export function gcmValues(recording: GcmRecording): ValuesFacet {
  const { run } = recording;
  const encrypting = run.direction === 'encrypt';
  const lastXor = recording.blocks[recording.blocks.length - 1]?.steps.xor ?? INITIAL_STEP_INDEX;
  const output = releasesOutput(recording) ? optionalValue(encrypting ? 'ciphertext' : 'plaintext', encrypting ? 'ciphertext' : 'plaintext', gcmCtrOutput(recording), encrypting ? lastXor : recording.verify!.step) : [];
  const values = [
    valueRef(NS, 'key', 'key', Array.from(run.key), INITIAL_STEP_INDEX),
    valueRef(NS, 'iv', 'nonce', run.iv, INITIAL_STEP_INDEX),
    ...optionalValue('aad', 'public', run.aad, INITIAL_STEP_INDEX),
    ...optionalValue(encrypting ? 'plaintext' : 'ciphertext', encrypting ? 'plaintext' : 'ciphertext', run.input, INITIAL_STEP_INDEX),
    ...(encrypting ? [] : [valueRef(NS, 'receivedTag', 'tag', run.receivedTag, INITIAL_STEP_INDEX)]),
    valueRef(NS, 'h', 'subkey', recording.h, recording.hashKeyStep),
    valueRef(NS, 'j0', 'state', recording.j0, recording.j0Step),
    valueRef(NS, 's', 'state', recording.s, recording.ghash[recording.ghash.length - 1]!.step),
    valueRef(NS, 'tag', 'tag', recording.tag, recording.tagStep),
    ...output,
  ];
  return { kind: 'values', schemaVersion: 1, values };
}

/** Setup nodes (lane −1): H = E_K(0¹²⁸), the IV and J0 (fed by H too on the GHASH path). */
function setupNodes(chain: ChainBuilder, recording: GcmRecording): void {
  const { run } = recording;
  chain.node({ id: 'h', block: -1, kind: 'cipher', label: label('hashKey'), bytes: recording.h, activeAt: recording.hashKeyStep, valueRef: 'h', ...cipherZoom(run.cipher, run.key, new Array<number>(GF128_BYTES).fill(0)) });
  chain.node({ id: 'iv', block: -1, kind: 'iv', label: label('iv'), bytes: run.iv, activeAt: INITIAL_STEP_INDEX, valueRef: 'iv', segmentId: 'iv' });
  chain.node({ id: 'j0', block: -1, kind: 'counter', label: label('j0'), bytes: recording.j0, activeAt: recording.j0Step, valueRef: 'j0' });
  chain.link(recording.j0Ghash.length > 0 ? ['iv', 'h'] : 'iv', 'j0');
}

/** What the XOR and output nodes of a GCTR lane show: their bytes, labels and when the output appears. */
interface LaneResult {
  xor: { label: I18nRef; bytes: number[] };
  output: { label: I18nRef; bytes: number[]; activeAt: number };
}

/**
 * Encrypting: the ciphertext block, at the XOR step. Decrypting (SP 800-38D §7.2): the XOR yields only
 * a candidate, held back (no bytes) until the tag is checked; the plaintext node gets its bytes at the
 * verify step when authentic, and none (discarded) on FAIL.
 */
function laneResult(recording: GcmRecording, block: GcmCtrBlock, n: number): LaneResult {
  if (recording.verify === undefined) return { xor: { label: label('xor'), bytes: block.output }, output: { label: label('ciphertext', n), bytes: block.output, activeAt: block.steps.xor } };
  const released = releasesOutput(recording);
  return {
    xor: { label: label('xorWithheld'), bytes: [] },
    output: { label: label(released ? 'plaintext' : 'plaintextDiscarded', n), bytes: released ? block.output : [], activeAt: recording.verify.step },
  };
}

/** One GCTR lane: CBᵢ → E_K → keystream; input ⊕ keystream → output. The ciphertext node carries its wire segment. */
function ctrLane(chain: ChainBuilder, recording: GcmRecording, block: GcmCtrBlock, index: number): void {
  const { run } = recording;
  const encrypting = run.direction === 'encrypt';
  const n = index + 1;
  const node = laneNodes(chain, index);
  const segment = { segmentId: blockSegmentId(index) };
  const result = laneResult(recording, block, n);
  const counter = node('counter', 'counter', label('counter', n), block.counter, block.steps.counter, index === 0 ? 'j0' : laneNodeId(index - 1, 'counter'));
  const cipher = node('cipher', 'cipher', label('encrypt'), block.keystream, block.steps.cipher, counter, cipherZoom(run.cipher, run.key, block.counter));
  const keystream = node('keystream', 'keystream', label('keystream', n), block.keystream.slice(0, block.input.length), block.steps.cipher, cipher);
  const input = node('input', 'input', label(encrypting ? 'plaintext' : 'ciphertext', n), block.input, INITIAL_STEP_INDEX, undefined, encrypting ? {} : segment);
  const xor = node('xor', 'xor', result.xor.label, result.xor.bytes, block.steps.xor, [input, keystream]);
  node('output', 'output', result.output.label, result.output.bytes, result.output.activeAt, xor, encrypting ? segment : {});
}

/** The node a GHASH block comes from: an AAD node, the ciphertext node of a GCTR lane, or a length node. */
function ghashSourceNode(chain: ChainBuilder, recording: GcmRecording, trace: GhashTrace, lane: number): string {
  if (trace.source === 'ciphertext') return laneNodeId(trace.index, recording.run.direction === 'encrypt' ? 'output' : 'input');
  if (trace.source === 'aad') return chain.node({ id: `ghash.aad${trace.index}`, block: lane, kind: 'aad', label: label('aad', trace.index + 1), bytes: trace.data, activeAt: INITIAL_STEP_INDEX });
  return chain.node({ id: 'ghash.length', block: lane, kind: 'length', label: label('length'), bytes: trace.block, activeAt: trace.step });
}

/** The GHASH lane: Yᵢ = (Yᵢ₋₁ ⊕ Bᵢ) • H for every block; the last Y is S. Returns the id of S. */
function ghashLane(chain: ChainBuilder, recording: GcmRecording, lane: number): string {
  let previous: string | undefined;
  recording.ghash.forEach((trace, index) => {
    const source = ghashSourceNode(chain, recording, trace, lane);
    const isLast = index === recording.ghash.length - 1;
    const id = chain.node({ id: `ghash.x${index + 1}`, block: lane, kind: 'hash', label: label(isLast ? 's' : 'hash', index + 1), bytes: trace.product, activeAt: trace.step, ...(isLast ? { valueRef: 's' } : {}) });
    chain.link([...(previous === undefined ? [] : [previous]), source, 'h'], id);
    previous = id;
  });
  return previous!;
}

/** The tag nodes: E_K(J0) and T = MSB_t(S ⊕ E_K(J0)); when decrypting also the received tag and the verify node. */
function tagNodes(chain: ChainBuilder, recording: GcmRecording, lane: number, s: string): void {
  const { run } = recording;
  const encrypting = run.direction === 'encrypt';
  chain.node({ id: 'tag.mask', block: lane, kind: 'cipher', label: label('mask'), bytes: recording.mask, activeAt: recording.encryptJ0Step, ...cipherZoom(run.cipher, run.key, recording.j0) });
  chain.link('j0', 'tag.mask');
  chain.node({ id: 'tag.t', block: lane, kind: 'tag', label: label(encrypting ? 'tag' : 'tagRecomputed'), bytes: recording.tag, activeAt: recording.tagStep, valueRef: 'tag', ...(encrypting ? { segmentId: 'tag' } : {}) });
  chain.link([s, 'tag.mask'], 'tag.t');
  if (recording.verify === undefined) return;
  chain.node({ id: 'tag.received', block: lane, kind: 'tag', label: label('tagReceived'), bytes: run.receivedTag, activeAt: INITIAL_STEP_INDEX, valueRef: 'receivedTag', segmentId: 'tag' });
  chain.node({ id: 'tag.verify', block: lane, kind: 'tag', label: label(recording.verify.authentic ? 'verifyOk' : 'verifyFail'), bytes: recording.tag, activeAt: recording.verify.step });
  chain.link(['tag.t', 'tag.received'], 'tag.verify');
}

/** GCTR lanes 0…n−1, then one GHASH lane n that also holds the tag. */
export function gcmChain(recording: GcmRecording): ChainFacet {
  const chain = new ChainBuilder();
  setupNodes(chain, recording);
  recording.blocks.forEach((block, index) => ctrLane(chain, recording, block, index));
  const lane = recording.blocks.length;
  tagNodes(chain, recording, lane, ghashLane(chain, recording, lane));
  return chain.toFacet({ mode: 'gcm', direction: recording.run.direction, formula: i18nRef(`${NS}.formula.${recording.run.direction}`) });
}

/** Wire offsets of every byte of each ciphertext block segment, by block index. */
function ciphertextSegments(wire: WireBuilder, recording: GcmRecording): number[][] {
  const encrypting = recording.run.direction === 'encrypt';
  return recording.blocks.map((block, index) => {
    const bytes = encrypting ? block.output : block.input;
    return addBlockSegment(wire, NS, index, bytes, encrypting ? block.steps.xor : INITIAL_STEP_INDEX);
  });
}

/** What travels: IV, AAD, the ciphertext blocks (sent as they are XORed when encrypting) and the tag. */
export function gcmWire(recording: GcmRecording): WireFacet {
  const { run } = recording;
  const encrypting = run.direction === 'encrypt';
  const wire = new WireBuilder();
  const iv = wire.segment({ id: 'iv', role: 'iv', label: i18nRef(`${NS}.wire.iv`), bytes: run.iv, valueRef: 'iv', availableAt: INITIAL_STEP_INDEX });
  const aad = run.aad.length === 0 ? [] : wire.segment({ id: 'aad', role: 'aad', label: i18nRef(`${NS}.wire.aad`), bytes: run.aad, valueRef: 'aad', availableAt: INITIAL_STEP_INDEX });
  const blocks = ciphertextSegments(wire, recording);
  const tagBytes = encrypting ? recording.tag : run.receivedTag;
  const tagStep = encrypting ? recording.tagStep : INITIAL_STEP_INDEX;
  const tag = wire.segment({ id: 'tag', role: 'tag', label: i18nRef(`${NS}.wire.tag`), bytes: tagBytes, valueRef: encrypting ? 'tag' : 'receivedTag', availableAt: tagStep });
  wire.activate(INITIAL_STEP_INDEX, [...iv, ...aad]);
  recording.blocks.forEach((block, index) => wire.activate(block.steps.xor, blocks[index]!));
  for (const trace of recording.ghash) {
    const offsets = trace.source === 'aad' ? aad : trace.source === 'ciphertext' ? (blocks[trace.index] ?? []) : [];
    wire.activate(trace.step, trace.source === 'aad' ? offsets.slice(trace.index * GF128_BYTES, (trace.index + 1) * GF128_BYTES) : offsets);
  }
  wire.activate(encrypting ? recording.tagStep : recording.verify!.step, tag);
  return wire.toFacet();
}

/** One field step: (Y ⊕ B) • H = product, with the terms Y ⊕ B, H and the product. */
function fieldStep(trace: GhashTrace, n: number, h: number[], formula: 'j0' | 'ghash'): FieldStep {
  const params = { n, prev: n - 1 };
  return {
    step: trace.step,
    formula: i18nRef(`${NS}.field.${formula}`, params),
    terms: [
      { id: 'sum', label: i18nRef(`${NS}.field.${formula}Sum`, params), bytes: trace.sum, role: 'operand', op: 'xor' },
      { id: 'h', label: i18nRef(`${NS}.field.h`), bytes: h, role: 'operand', op: 'mul', valueRef: 'h' },
      { id: 'product', label: i18nRef(`${NS}.field.${formula}Product`, { n }), bytes: trace.product, role: 'result', op: 'result' },
    ],
  };
}

/** Step −1: GHASH starts from Y₀ = 0 once the setup has derived H (H itself is not known yet). */
function initialFieldStep(): FieldStep {
  return {
    step: INITIAL_STEP_INDEX,
    formula: i18nRef(`${NS}.field.initial`),
    terms: [{ id: 'y0', label: i18nRef(`${NS}.field.y0`), bytes: new Array<number>(GF128_BYTES).fill(0), role: 'operand' }],
  };
}

/** The initial entry, then one field step per GHASH multiply: the J0 GHASH (non-96-bit IV) and the tag GHASH, in step order. */
export function gcmField(recording: GcmRecording): FieldFacet {
  const steps = [
    initialFieldStep(),
    ...recording.j0Ghash.map((trace, index) => fieldStep(trace, index + 1, recording.h, 'j0')),
    ...recording.ghash.map((trace, index) => fieldStep(trace, index + 1, recording.h, 'ghash')),
  ];
  return { kind: 'field', schemaVersion: 1, notation: GF128_FIELD_NOTATION, steps };
}
