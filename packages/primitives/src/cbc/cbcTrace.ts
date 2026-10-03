import {
  allIndices,
  blockIndices,
  highlight,
  i18nRef,
  padStep,
  BlockOpRecorder,
  toHex,
  unpadStep,
  xorBytes,
  zeroSnapshot,
  type BlockCipher,
  type ModeDirection,
  type ModePadding,
  type Pkcs7UnpadResult,
  type RegionSpec,
  type StateFacet,
} from '@cryventure/core';
import type { CbcOpName } from './manifest.ts';

/** Traced CBC (SP 800-38A §6.2): scope levels block → op, one opaque cipher call per block. */
export type CbcRegion = 'input' | 'iv' | 'chain' | 'work' | 'output';
export type CbcOp = { op: CbcOpName };
export type CbcStateFacet = StateFacet<CbcRegion, CbcOp>;

const NS = 'plugin.cbc';
const BLANK_REGIONS: readonly CbcRegion[] = ['work', 'output'];

/** `input`/`output` hold all blocks; `iv`, `chain` (Cᵢ₋₁) and `work` (the cipher's in/out) one block each. */
export function cbcRegions(length: number, blockSize: number): RegionSpec<CbcRegion>[] {
  const shapes: Record<CbcRegion, number> = { input: length, iv: blockSize, chain: blockSize, work: blockSize, output: length };
  return (Object.keys(shapes) as CbcRegion[]).map((id) => ({
    id,
    labelKey: `${NS}.region.${id}`,
    elem: 'u8',
    shape: [shapes[id]],
    ...(BLANK_REGIONS.includes(id) ? { initial: 'blank' as const } : {}),
  }));
}

export interface CbcRun {
  cipher: BlockCipher;
  key: Uint8Array;
  iv: number[];
  /** The input as given (unpadded plaintext, or the ciphertext). */
  data: number[];
  direction: ModeDirection;
  padding: ModePadding;
}

/** One block as the chain and wire facets need it, with the steps that produce its values. */
export interface CbcBlockTrace {
  /** The block of the input region (Pᵢ when encrypting, Cᵢ when decrypting). */
  input: number[];
  /** Cᵢ₋₁ (the IV for the first block). */
  previous: number[];
  cipherIn: number[];
  cipherOut: number[];
  output: number[];
  steps: { xor: number; cipher: number; emit: number };
}

export interface CbcRecording {
  facet: CbcStateFacet;
  blocks: CbcBlockTrace[];
  /** Everything the output region ends with (all blocks; still padded after decryption). */
  processed: number[];
  pad?: { step: number; bytes: number[] };
  unpad?: { step: number; result: Pkcs7UnpadResult };
}

type CbcRecorder = BlockOpRecorder<CbcRegion, CbcOp>;

const cipherName = (cipher: BlockCipher): string => cipher.id.toUpperCase();
const xorRows = (a: readonly number[], b: readonly number[]): number[] => Array.from(xorBytes(a, b));

function xorChainNarration(direction: ModeDirection, index: number, block: number[], previous: number[], result: number[]) {
  const suffix = direction === 'encrypt' ? '' : 'Decrypt';
  const params = { n: index + 1, block: toHex(block), previous: toHex(previous), result: toHex(result) };
  return index === 0 ? i18nRef(`${NS}.step.xorChainFirst${suffix}`, params) : i18nRef(`${NS}.step.xorChain${suffix}`, { ...params, prev: index });
}

/** Encrypts block `index`: xorChain (work = Pᵢ ⊕ Cᵢ₋₁) → encryptBlock (work = E_K(work)) → emit (output and chain = Cᵢ). */
function encryptBlockSteps(recorder: CbcRecorder, run: CbcRun, index: number, input: number[], previous: number[]): CbcBlockTrace {
  const blockSize = run.cipher.blockSize;
  const indices = blockIndices(index, blockSize, (index + 1) * blockSize);
  const whole = allIndices(blockSize);
  const cipherIn = xorRows(input, previous);
  const xor = recorder.op({
    op: 'xorChain',
    writes: [{ region: 'work', offset: 0, values: cipherIn }],
    highlights: [highlight('input', 'read', indices), highlight('chain', 'read', whole), highlight('work', 'xor', whole)],
    narration: xorChainNarration('encrypt', index, input, previous, cipherIn),
  });
  const cipherOut = Array.from(run.cipher.encryptBlock(run.key, Uint8Array.from(cipherIn)));
  const cipher = recorder.op({
    op: 'encryptBlock',
    writes: [{ region: 'work', offset: 0, values: cipherOut }],
    highlights: [highlight('work', 'write', whole)],
    narration: i18nRef(`${NS}.step.encryptBlock`, { n: index + 1, cipher: cipherName(run.cipher), input: toHex(cipherIn), output: toHex(cipherOut) }),
  });
  const emit = recorder.op({
    op: 'emit',
    writes: [
      { region: 'output', offset: index * blockSize, values: cipherOut },
      { region: 'chain', offset: 0, values: cipherOut },
    ],
    highlights: [highlight('work', 'read', whole), highlight('output', 'write', indices), highlight('chain', 'write', whole)],
    narration: i18nRef(`${NS}.step.emitEncrypt`, { n: index + 1, block: toHex(cipherOut) }),
  });
  return { input, previous, cipherIn, cipherOut, output: cipherOut, steps: { xor, cipher, emit } };
}

/** Decrypts block `index`: decryptBlock (work = D_K(Cᵢ)) → xorChain (work ⊕= Cᵢ₋₁) → emit (output = Pᵢ, chain = Cᵢ). */
function decryptBlockSteps(recorder: CbcRecorder, run: CbcRun, index: number, input: number[], previous: number[]): CbcBlockTrace {
  const blockSize = run.cipher.blockSize;
  const indices = blockIndices(index, blockSize, (index + 1) * blockSize);
  const whole = allIndices(blockSize);
  const cipherOut = Array.from(run.cipher.decryptBlock(run.key, Uint8Array.from(input)));
  const cipher = recorder.op({
    op: 'decryptBlock',
    writes: [{ region: 'work', offset: 0, values: cipherOut }],
    highlights: [highlight('input', 'read', indices), highlight('work', 'write', whole)],
    narration: i18nRef(`${NS}.step.decryptBlock`, { n: index + 1, cipher: cipherName(run.cipher), input: toHex(input), output: toHex(cipherOut) }),
  });
  const output = xorRows(cipherOut, previous);
  const xor = recorder.op({
    op: 'xorChain',
    writes: [{ region: 'work', offset: 0, values: output }],
    highlights: [highlight('chain', 'read', whole), highlight('work', 'xor', whole)],
    narration: xorChainNarration('decrypt', index, cipherOut, previous, output),
  });
  const emit = recorder.op({
    op: 'emit',
    writes: [
      { region: 'output', offset: index * blockSize, values: output },
      { region: 'chain', offset: 0, values: input },
    ],
    highlights: [highlight('work', 'read', whole), highlight('output', 'write', indices), highlight('input', 'read', indices), highlight('chain', 'write', whole)],
    narration: i18nRef(`${NS}.step.emitDecrypt`, { n: index + 1, block: toHex(output) }),
  });
  return { input, previous, cipherIn: input, cipherOut, output, steps: { xor, cipher, emit } };
}

function recordEncrypt(run: CbcRun): CbcRecording {
  const { cipher, iv, data } = run;
  const blockSize = cipher.blockSize;
  const length = run.padding === 'pkcs7' ? data.length + blockSize - (data.length % blockSize) : data.length;
  const regions = cbcRegions(length, blockSize);
  const initial = { ...zeroSnapshot(regions), input: [...data, ...new Array<number>(length - data.length).fill(0)], iv: [...iv], chain: [...iv] };
  const recorder: CbcRecorder = new BlockOpRecorder(regions, initial, i18nRef(`${NS}.step.initialEncrypt`, { bytes: data.length, blockSize, cipher: cipherName(cipher) }));
  let padded = data;
  let pad: CbcRecording['pad'];
  const blocks: CbcBlockTrace[] = [];
  for (const index of allIndices(length / blockSize)) {
    recorder.block(index, () => {
      if (index === 0 && run.padding === 'pkcs7') {
        const padding = padStep(NS, data, blockSize);
        padded = padding.padded;
        pad = { step: recorder.op(padding.step), bytes: padded.slice(data.length) };
      }
      const previous = blocks.at(-1)?.output ?? iv;
      blocks.push(encryptBlockSteps(recorder, run, index, padded.slice(index * blockSize, (index + 1) * blockSize), previous));
    });
  }
  return { facet: recorder.toFacet(), blocks, processed: blocks.flatMap((block) => block.output), ...(pad === undefined ? {} : { pad }) };
}

function recordDecrypt(run: CbcRun): CbcRecording {
  const { cipher, iv, data } = run;
  const blockSize = cipher.blockSize;
  const regions = cbcRegions(data.length, blockSize);
  const blockTotal = data.length / blockSize;
  const initial = { ...zeroSnapshot(regions), input: [...data], iv: [...iv], chain: [...iv] };
  const recorder: CbcRecorder = new BlockOpRecorder(regions, initial, i18nRef(`${NS}.step.initialDecrypt`, { bytes: data.length, blocks: blockTotal, cipher: cipherName(cipher) }));
  const blocks: CbcBlockTrace[] = [];
  let unpad: CbcRecording['unpad'];
  for (const index of allIndices(blockTotal)) {
    recorder.block(index, () => {
      const previous = blocks.at(-1)?.input ?? iv;
      blocks.push(decryptBlockSteps(recorder, run, index, data.slice(index * blockSize, (index + 1) * blockSize), previous));
      if (index === blockTotal - 1 && run.padding === 'pkcs7') {
        const check = unpadStep(NS, blocks.flatMap((block) => block.output), blockSize);
        unpad = { step: recorder.op(check.step), result: check.result };
      }
    });
  }
  return { facet: recorder.toFacet(), blocks, processed: blocks.flatMap((block) => block.output), ...(unpad === undefined ? {} : { unpad }) };
}

/**
 * Records CBC over `run.data`, which must be block-aligned unless encrypting with PKCS#7 (the run
 * checks this first). Encrypt: pad (once), then per block xorChain → encryptBlock → emit. Decrypt:
 * per block decryptBlock → xorChain → emit, then unpad (PKCS#7 only).
 */
export function recordCbc(run: CbcRun): CbcRecording {
  return run.direction === 'encrypt' ? recordEncrypt(run) : recordDecrypt(run);
}
