import {
  allIndices,
  BlockOpRecorder,
  blockIndices,
  highlight,
  i18nRef,
  padStep,
  toHex,
  unpadStep,
  zeroSnapshot,
  type BlockCipher,
  type ModeDirection,
  type ModePadding,
  type Pkcs7UnpadResult,
  type RegionSpec,
  type StateFacet,
} from '@cryventure/core';
import type { EcbOpName } from './manifest.ts';

/** Traced ECB (SP 800-38A §6.1): scope levels block → op, one opaque cipher call per block. */
export type EcbRegion = 'input' | 'work' | 'output';
export type EcbOp = { op: EcbOpName };
export type EcbStateFacet = StateFacet<EcbRegion, EcbOp>;
type EcbRecorder = BlockOpRecorder<EcbRegion, EcbOp>;

const NS = 'plugin.ecb';

/** `input`/`output` hold all blocks; `work` is the cipher's in/out register (one block). */
export function ecbRegions(length: number, blockSize: number): RegionSpec<EcbRegion>[] {
  const region = (id: EcbRegion, size: number, blank: boolean): RegionSpec<EcbRegion> => ({
    id,
    labelKey: `${NS}.region.${id}`,
    elem: 'u8',
    shape: [size],
    ...(blank ? { initial: 'blank' as const } : {}),
  });
  return [region('input', length, false), region('work', blockSize, true), region('output', length, true)];
}

export interface EcbRun {
  cipher: BlockCipher;
  key: Uint8Array;
  /** The input as given (unpadded plaintext, or the ciphertext). */
  data: number[];
  direction: ModeDirection;
  padding: ModePadding;
}

/** One block with the steps that produce its values (for the chain and wire facets). */
export interface EcbBlockTrace {
  /** The cipher input: Pᵢ (padded) when encrypting, Cᵢ when decrypting. */
  input: number[];
  output: number[];
  steps: { cipher: number; emit: number };
}

export interface EcbRecording {
  facet: EcbStateFacet;
  blocks: EcbBlockTrace[];
  /** Everything the output region ends with (all blocks; still padded after decryption). */
  processed: number[];
  pad?: { step: number; bytes: number[] };
  unpad?: { step: number; result: Pkcs7UnpadResult };
}

const cipherName = (cipher: BlockCipher): string => cipher.id.toUpperCase();

/** One block: E_K or D_K into `work`, then emit `work` into the output region. */
function recordBlock(recorder: EcbRecorder, run: EcbRun, index: number, input: number[], length: number): EcbBlockTrace {
  const { cipher, key, direction } = run;
  const blockSize = cipher.blockSize;
  const indices = blockIndices(index, blockSize, length);
  const work = allIndices(blockSize);
  const output = Array.from(direction === 'encrypt' ? cipher.encryptBlock(key, Uint8Array.from(input)) : cipher.decryptBlock(key, Uint8Array.from(input)));
  const cipherStep = recorder.op({
    op: direction === 'encrypt' ? 'encryptBlock' : 'decryptBlock',
    writes: [{ region: 'work', offset: 0, values: output }],
    highlights: [highlight('input', 'read', indices), highlight('work', 'write', work)],
    narration: i18nRef(`${NS}.step.${direction}Block`, { n: index + 1, cipher: cipherName(cipher), input: toHex(input), output: toHex(output) }),
  });
  const emit = recorder.op({
    op: 'emit',
    writes: [{ region: 'output', offset: index * blockSize, values: output }],
    highlights: [highlight('work', 'read', work), highlight('output', 'write', indices)],
    narration: i18nRef(`${NS}.step.emit${direction === 'encrypt' ? 'Encrypt' : 'Decrypt'}`, { n: index + 1, block: toHex(output) }),
  });
  return { input, output, steps: { cipher: cipherStep, emit } };
}

function recordEncrypt(run: EcbRun): EcbRecording {
  const { cipher, data } = run;
  const blockSize = cipher.blockSize;
  const length = run.padding === 'pkcs7' ? data.length + blockSize - (data.length % blockSize) : data.length;
  const regions = ecbRegions(length, blockSize);
  const initial = { ...zeroSnapshot(regions), input: [...data, ...new Array<number>(length - data.length).fill(0)] };
  const recorder: EcbRecorder = new BlockOpRecorder(regions, initial, i18nRef(`${NS}.step.initialEncrypt`, { bytes: data.length, blockSize, cipher: cipherName(cipher) }));
  let padded = data;
  let pad: EcbRecording['pad'];
  const blocks = allIndices(length / blockSize).map((index) =>
    recorder.block(index, () => {
      if (index === 0 && run.padding === 'pkcs7') {
        const padding = padStep(NS, data, blockSize);
        padded = padding.padded;
        pad = { step: recorder.op(padding.step), bytes: padded.slice(data.length) };
      }
      return recordBlock(recorder, run, index, padded.slice(index * blockSize, (index + 1) * blockSize), length);
    }),
  );
  return { facet: recorder.toFacet(), blocks, processed: blocks.flatMap((block) => block.output), ...(pad === undefined ? {} : { pad }) };
}

function recordDecrypt(run: EcbRun): EcbRecording {
  const { cipher, data } = run;
  const blockSize = cipher.blockSize;
  const regions = ecbRegions(data.length, blockSize);
  const blockTotal = data.length / blockSize;
  const initial = { ...zeroSnapshot(regions), input: [...data] };
  const recorder: EcbRecorder = new BlockOpRecorder(regions, initial, i18nRef(`${NS}.step.initialDecrypt`, { bytes: data.length, blocks: blockTotal, cipher: cipherName(cipher) }));
  const blocks: EcbBlockTrace[] = [];
  let unpad: EcbRecording['unpad'];
  for (const index of allIndices(blockTotal)) {
    recorder.block(index, () => {
      blocks.push(recordBlock(recorder, run, index, data.slice(index * blockSize, (index + 1) * blockSize), data.length));
      if (index === blockTotal - 1 && run.padding === 'pkcs7') {
        const check = unpadStep(NS, blocks.flatMap((block) => block.output), blockSize);
        unpad = { step: recorder.op(check.step), result: check.result };
      }
    });
  }
  return { facet: recorder.toFacet(), blocks, processed: blocks.flatMap((block) => block.output), ...(unpad === undefined ? {} : { unpad }) };
}

/**
 * Records ECB over `run.data`, which must be block-aligned unless encrypting with PKCS#7 (the run
 * checks this first). Encrypt: pad (once), then per block encryptBlock → emit. Decrypt: per block
 * decryptBlock → emit, then unpad (PKCS#7 only).
 */
export function recordEcb(run: EcbRun): EcbRecording {
  return run.direction === 'encrypt' ? recordEncrypt(run) : recordDecrypt(run);
}
