import type { RegionSpec, Snapshot, StateFacet } from '../facets/state.ts';
import { i18nRef } from '../i18n.ts';
import { cipherName } from '../modes/blockModeFacets.ts';
import { blocksOf } from '../modes/blocks.ts';
import type { ModeDirection, ModePadding } from '../modes/modeKit.ts';
import type { Pkcs7UnpadResult } from '../padding/pkcs7.ts';
import { zeroSnapshot } from '../plugin/regions.ts';
import type { BlockCipher } from '../ports.ts';
import { BlockOpRecorder } from './blockOpRecorder.ts';
import { padStep, unpadStep } from './paddingSteps.ts';

/**
 * The shared recording of the traced ECB/CBC modes (docs/M3.md §4): the input region, the PKCS#7
 * pad step (top level, before the first block: it prepares the whole input), one block scope per
 * block, and the unpad step at the end of the last block when decrypting with PKCS#7.
 */

/** The pad step and the bytes it appended. */
export interface PadRecord {
  step: number;
  bytes: number[];
}

/** The unpad step and the PKCS#7 check it narrates. */
export interface UnpadRecord {
  step: number;
  result: Pkcs7UnpadResult;
}

/** The regions and ops every padded mode records besides its own. */
export type PaddedModeRegion = 'input' | 'output';
export type PaddedModeOp = { op: 'pad' } | { op: 'unpad' };

/** What a padded mode runs: the input as given (unpadded plaintext, or the ciphertext). */
export interface PaddedModeRun {
  cipher: BlockCipher;
  key: Uint8Array;
  data: number[];
  direction: ModeDirection;
  padding: ModePadding;
}

/** One recorded block: its block of the input region and what the mode writes into the output region. */
export interface ModeBlockTrace {
  /** Pᵢ (padded) when encrypting, Cᵢ when decrypting. */
  input: number[];
  output: number[];
}

/** The blocks of a padded-mode recording with its pad and unpad steps (what the chain and wire facets need). */
export interface PaddedModeBlocks<B extends ModeBlockTrace = ModeBlockTrace> {
  blocks: B[];
  pad?: PadRecord;
  unpad?: UnpadRecord;
}

export interface PaddedModeRecording<R extends string, Op extends { op: string }, B extends ModeBlockTrace> extends PaddedModeBlocks<B> {
  facet: StateFacet<R | PaddedModeRegion, Op | PaddedModeOp>;
}

/** What `blockStep` records one block with. */
export interface BlockStepInput<R extends string, Op extends { op: string }, B extends ModeBlockTrace> {
  recorder: BlockOpRecorder<R | PaddedModeRegion, Op | PaddedModeOp>;
  index: number;
  /** This block of the input region. */
  input: number[];
  /** The previous block's trace (`undefined` for the first block). */
  previous: B | undefined;
}

export interface PaddedModeSpec<R extends string, Op extends { op: string }, B extends ModeBlockTrace> {
  namespace: string;
  run: PaddedModeRun;
  /** The mode's regions for an input region of `length` bytes. */
  regions(length: number): RegionSpec<R | PaddedModeRegion>[];
  /** Initial values of the mode's own regions besides `input` (e.g. the IV). */
  initial?: Partial<Snapshot<R>>;
  /** Records the ops of one block (inside its block scope) and returns its trace. */
  blockStep(step: BlockStepInput<R, Op, B>): B;
}

/** Everything the output region ends with (all blocks; still padded after decryption). */
export function processedBytes(recording: { blocks: readonly ModeBlockTrace[] }): number[] {
  return recording.blocks.flatMap((block) => block.output);
}

/** Length of the encrypt input region: the data, plus the PKCS#7 padding when enabled. */
export function encryptInputLength(dataLength: number, blockSize: number, padding: ModePadding): number {
  return padding === 'pkcs7' ? dataLength + blockSize - (dataLength % blockSize) : dataLength;
}

/** The input region before the pad step: the data, then zeros where the padding goes. */
export function unpaddedInputRegion(data: readonly number[], length: number): number[] {
  return [...data, ...new Array<number>(length - data.length).fill(0)];
}

/** Records the PKCS#7 pad step (top level) when `padding` is `pkcs7`; returns the bytes to encrypt. */
export function recordPadding<R extends string, Op extends { op: string }>(
  recorder: BlockOpRecorder<R | 'input', Op | { op: 'pad' }>,
  namespace: string,
  data: number[],
  blockSize: number,
  padding: ModePadding,
): { padded: number[]; pad?: PadRecord } {
  if (padding !== 'pkcs7') return { padded: data };
  const { step, padded } = padStep(namespace, data, blockSize);
  return { padded, pad: { step: recorder.topLevelOp(step), bytes: padded.slice(data.length) } };
}

function initialNarration({ namespace, run }: PaddedModeSpec<string, { op: string }, ModeBlockTrace>) {
  const { cipher, data, direction } = run;
  const blockSize = cipher.blockSize;
  if (direction === 'encrypt') return i18nRef(`${namespace}.step.initialEncrypt`, { bytes: data.length, blockSize, cipher: cipherName(cipher) });
  return i18nRef(`${namespace}.step.initialDecrypt`, { bytes: data.length, count: data.length / blockSize, cipher: cipherName(cipher) });
}

/**
 * Records a padded block mode over `spec.run.data`, which must be block-aligned unless encrypting
 * with PKCS#7 (the run checks this first). Encrypt: pad (once), then `blockStep` per block. Decrypt:
 * `blockStep` per block, then unpad (PKCS#7 only) inside the last block.
 */
export function recordPaddedMode<R extends string, Op extends { op: string }, B extends ModeBlockTrace>(spec: PaddedModeSpec<R, Op, B>): PaddedModeRecording<R, Op, B> {
  const { namespace, run } = spec;
  const { data, padding } = run;
  const blockSize = run.cipher.blockSize;
  const encrypting = run.direction === 'encrypt';
  const length = encrypting ? encryptInputLength(data.length, blockSize, padding) : data.length;
  const regions = spec.regions(length);
  const initial = { ...zeroSnapshot(regions), ...spec.initial, input: unpaddedInputRegion(data, length) } as Snapshot<R | PaddedModeRegion>;
  const recorder = new BlockOpRecorder<R | PaddedModeRegion, Op | PaddedModeOp>(regions, initial, initialNarration(spec));
  const { padded, pad } = encrypting ? recordPadding(recorder, namespace, data, blockSize, padding) : { padded: data };
  const inputBlocks = blocksOf(Uint8Array.from(padded), blockSize).map((block) => Array.from(block));
  const blocks: B[] = [];
  let unpad: UnpadRecord | undefined;
  inputBlocks.forEach((input, index) =>
    recorder.block(index, () => {
      blocks.push(spec.blockStep({ recorder, index, input, previous: blocks.at(-1) }));
      if (!encrypting && padding === 'pkcs7' && index === inputBlocks.length - 1) {
        const check = unpadStep(namespace, processedBytes({ blocks }), blockSize);
        unpad = { step: recorder.op(check.step), result: check.result };
      }
    }),
  );
  return { facet: recorder.toFacet(), blocks, ...(pad === undefined ? {} : { pad }), ...(unpad === undefined ? {} : { unpad }) };
}
