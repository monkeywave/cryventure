import {
  allIndices,
  BlockOpRecorder,
  blockCount,
  blockIndices,
  cipherName,
  highlight,
  i18nRef,
  incrementCounter,
  toHex,
  u8Regions,
  xorBytesToArray,
  zeroSnapshot,
  type BlockCipher,
  type StateFacet,
} from '@cryventure/core';
import type { CtrOpName } from './manifest.ts';

/** Traced CTR (SP 800-38A §6.5): scope levels block → op, one opaque cipher call per block. */
export type CtrRegion = 'input' | 'counter' | 'keystream' | 'output';
export type CtrOp = { op: CtrOpName };
export type CtrStateFacet = StateFacet<CtrRegion, CtrOp>;
type CtrRecorder = BlockOpRecorder<CtrRegion, CtrOp>;

const NS = 'plugin.ctr';

export interface CtrRun {
  cipher: BlockCipher;
  key: Uint8Array;
  counter: number[];
  data: number[];
}

/** One block with the steps that produce its values (for the chain and wire facets). */
export interface CtrBlockTrace {
  /** Tᵢ, the cipher's input. */
  counter: number[];
  /** E_K(Tᵢ), the whole keystream block. */
  keystream: number[];
  /** Pᵢ (the last block may be shorter than a block). */
  input: number[];
  /** Pᵢ ⊕ the first |Pᵢ| keystream bytes. */
  output: number[];
  /** The incrementCounter step (-1 for the first block, whose counter is given). */
  steps: { counter: number; cipher: number; xor: number };
}

export interface CtrRecording {
  facet: CtrStateFacet;
  blocks: CtrBlockTrace[];
}

/** The output of all blocks. */
export function ctrOutput(recording: CtrRecording): number[] {
  return recording.blocks.flatMap((block) => block.output);
}

/** The keystream bytes actually used (as long as the input). */
export function ctrKeystream(recording: CtrRecording): number[] {
  return recording.blocks.flatMap((block) => block.keystream.slice(0, block.input.length));
}

function recordIncrement(recorder: CtrRecorder, index: number, counter: number[]): number {
  return recorder.op({
    op: 'incrementCounter',
    writes: [{ region: 'counter', offset: 0, values: counter }],
    highlights: [highlight('counter', 'write', allIndices(counter.length))],
    narration: i18nRef(`${NS}.step.incrementCounter`, { n: index + 1, prev: index, counter: toHex(counter) }),
  });
}

function xorNarration(index: number, input: number[], keystream: number[], output: number[], blockSize: number) {
  const params = { n: index + 1, input: toHex(input), keystream: toHex(keystream.slice(0, input.length)), output: toHex(output) };
  if (input.length === blockSize) return i18nRef(`${NS}.step.xorKeystream`, params);
  return i18nRef(`${NS}.step.xorKeystreamPartial`, { ...params, used: input.length, unused: blockSize - input.length });
}

/** One block: [Tᵢ = Tᵢ₋₁ + 1], E_K(Tᵢ) into `keystream`, then output = input ⊕ keystream (truncated). */
function recordBlock(recorder: CtrRecorder, run: CtrRun, index: number, counter: number[]): CtrBlockTrace {
  const { cipher, key, data } = run;
  const blockSize = cipher.blockSize;
  const counterStep = index === 0 ? -1 : recordIncrement(recorder, index, counter);
  const keystream = Array.from(cipher.encryptBlock(key, Uint8Array.from(counter)));
  const cipherStep = recorder.op({
    op: 'encryptBlock',
    writes: [{ region: 'keystream', offset: 0, values: keystream }],
    highlights: [highlight('counter', 'read', allIndices(blockSize)), highlight('keystream', 'write', allIndices(blockSize))],
    narration: i18nRef(`${NS}.step.encryptBlock`, { n: index + 1, cipher: cipherName(cipher), counter: toHex(counter), keystream: toHex(keystream) }),
  });
  const indices = blockIndices(index, blockSize, data.length);
  const input = data.slice(index * blockSize, index * blockSize + indices.length);
  const output = xorBytesToArray(input, keystream.slice(0, input.length));
  const xor = recorder.op({
    op: 'xorKeystream',
    writes: [{ region: 'output', offset: index * blockSize, values: output }],
    highlights: [highlight('input', 'read', indices), highlight('keystream', 'read', allIndices(input.length)), highlight('output', 'xor', indices)],
    narration: xorNarration(index, input, keystream, output, blockSize),
  });
  return { counter, keystream, input, output, steps: { counter: counterStep, cipher: cipherStep, xor } };
}

/**
 * Records CTR over `run.data` (any length): per block incrementCounter (from the second on) →
 * encryptBlock → xorKeystream. `input`/`output` hold all bytes; `counter` (the cipher's input Tᵢ)
 * and `keystream` (its output) one block each.
 */
export function recordCtr(run: CtrRun): CtrRecording {
  const { cipher, data } = run;
  const blockSize = cipher.blockSize;
  const regions = u8Regions<CtrRegion>(NS, { input: data.length, counter: blockSize, keystream: blockSize, output: data.length }, ['keystream', 'output']);
  const total = blockCount(data.length, blockSize);
  const initialNarration = i18nRef(`${NS}.step.initial`, { bytes: data.length, count: total, blockSize, cipher: cipherName(cipher), counter: toHex(run.counter) });
  const recorder: CtrRecorder = new BlockOpRecorder(regions, { ...zeroSnapshot(regions), input: [...data], counter: [...run.counter] }, initialNarration);
  let counter = run.counter;
  const blocks = allIndices(total).map((index) => {
    if (index > 0) counter = Array.from(incrementCounter(Uint8Array.from(counter)));
    return recorder.block(index, () => recordBlock(recorder, run, index, counter));
  });
  return { facet: recorder.toFacet(), blocks };
}
