import {
  allIndices,
  blockIndices,
  cipherName,
  highlight,
  i18nRef,
  recordPaddedMode,
  toHex,
  u8Regions,
  xorBytesToArray,
  type BlockStepInput,
  type ModeDirection,
  type PaddedModeRecording,
  type PaddedModeRun,
} from '@cryventure/core';
import type { CbcOpName } from './manifest.ts';

/** Traced CBC (SP 800-38A §6.2): scope levels block → op, one opaque cipher call per block. */
export type CbcRegion = 'input' | 'iv' | 'chain' | 'work' | 'output';
export type CbcOp = { op: CbcOpName };

const NS = 'plugin.cbc';

export interface CbcRun extends PaddedModeRun {
  iv: number[];
}

/** One block as the chain and wire facets need it, with the steps that produce its values. */
export interface CbcBlockTrace {
  /** The block of the input region (Pᵢ when encrypting, Cᵢ when decrypting). */
  input: number[];
  cipherIn: number[];
  cipherOut: number[];
  output: number[];
  steps: { xor: number; cipher: number; emit: number };
}

export type CbcRecording = PaddedModeRecording<CbcRegion, CbcOp, CbcBlockTrace>;
type CbcBlockStep = BlockStepInput<CbcRegion, CbcOp, CbcBlockTrace>;

function xorChainNarration(direction: ModeDirection, index: number, block: number[], previous: number[], result: number[]) {
  const suffix = direction === 'encrypt' ? '' : 'Decrypt';
  const params = { n: index + 1, block: toHex(block), previous: toHex(previous), result: toHex(result) };
  return index === 0 ? i18nRef(`${NS}.step.xorChainFirst${suffix}`, params) : i18nRef(`${NS}.step.xorChain${suffix}`, { ...params, prev: index });
}

/** Encrypts block `index`: xorChain (work = Pᵢ ⊕ Cᵢ₋₁) → encryptBlock (work = E_K(work)) → emit (output and chain = Cᵢ). */
function encryptBlockSteps(run: CbcRun, { recorder, index, input }: CbcBlockStep, previous: number[]): CbcBlockTrace {
  const blockSize = run.cipher.blockSize;
  const indices = blockIndices(index, blockSize, (index + 1) * blockSize);
  const whole = allIndices(blockSize);
  const cipherIn = xorBytesToArray(input, previous);
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
  return { input, cipherIn, cipherOut, output: cipherOut, steps: { xor, cipher, emit } };
}

/** Decrypts block `index`: decryptBlock (work = D_K(Cᵢ)) → xorChain (work ⊕= Cᵢ₋₁) → emit (output = Pᵢ, chain = Cᵢ). */
function decryptBlockSteps(run: CbcRun, { recorder, index, input }: CbcBlockStep, previous: number[]): CbcBlockTrace {
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
  const output = xorBytesToArray(cipherOut, previous);
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
  return { input, cipherIn: input, cipherOut, output, steps: { xor, cipher, emit } };
}

/**
 * Records CBC over `run.data`. Encrypt: pad (once), then per block xorChain → encryptBlock → emit.
 * Decrypt: per block decryptBlock → xorChain → emit, then unpad (PKCS#7 only). `input`/`output`
 * hold all blocks; `iv`, `chain` (Cᵢ₋₁) and `work` (the cipher's in/out) one block each.
 */
export function recordCbc(run: CbcRun): CbcRecording {
  const blockSize = run.cipher.blockSize;
  const encrypting = run.direction === 'encrypt';
  return recordPaddedMode<CbcRegion, CbcOp, CbcBlockTrace>({
    namespace: NS,
    run,
    regions: (length) => u8Regions<CbcRegion>(NS, { input: length, iv: blockSize, chain: blockSize, work: blockSize, output: length }, ['work', 'output']),
    initial: { iv: [...run.iv], chain: [...run.iv] },
    blockStep: (step) => {
      // Cᵢ₋₁: the previous ciphertext block (the output when encrypting, the input when decrypting), C₀ = IV.
      const previous = (encrypting ? step.previous?.output : step.previous?.input) ?? run.iv;
      return encrypting ? encryptBlockSteps(run, step, previous) : decryptBlockSteps(run, step, previous);
    },
  });
}
