import {
  allIndices,
  blockIndices,
  cipherName,
  highlight,
  i18nRef,
  recordPaddedMode,
  toHex,
  u8Regions,
  type BlockStepInput,
  type PaddedModeRecording,
  type PaddedModeRun,
} from '@cryventure/core';
import type { EcbOpName } from './manifest.ts';

/** Traced ECB (SP 800-38A §6.1): scope levels block → op, one opaque cipher call per block. */
export type EcbRegion = 'input' | 'work' | 'output';
export type EcbOp = { op: EcbOpName };

const NS = 'plugin.ecb';

export type EcbRun = PaddedModeRun;

/** One block with the steps that produce its values (for the chain and wire facets). */
export interface EcbBlockTrace {
  /** The cipher input: Pᵢ (padded) when encrypting, Cᵢ when decrypting. */
  input: number[];
  output: number[];
  steps: { cipher: number; emit: number };
}

export type EcbRecording = PaddedModeRecording<EcbRegion, EcbOp, EcbBlockTrace>;

/** One block: E_K or D_K into `work`, then emit `work` into the output region. */
function recordBlock(run: EcbRun, { recorder, index, input }: BlockStepInput<EcbRegion, EcbOp, EcbBlockTrace>): EcbBlockTrace {
  const { cipher, key, direction } = run;
  const blockSize = cipher.blockSize;
  const indices = blockIndices(index, blockSize, (index + 1) * blockSize);
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

/**
 * Records ECB over `run.data`. Encrypt: pad (once), then per block encryptBlock → emit. Decrypt:
 * per block decryptBlock → emit, then unpad (PKCS#7 only). `input`/`output` hold all blocks; `work`
 * is the cipher's in/out register (one block).
 */
export function recordEcb(run: EcbRun): EcbRecording {
  return recordPaddedMode<EcbRegion, EcbOp, EcbBlockTrace>({
    namespace: NS,
    run,
    regions: (length) => u8Regions<EcbRegion>(NS, { input: length, work: run.cipher.blockSize, output: length }, ['work', 'output']),
    blockStep: (step) => recordBlock(run, step),
  });
}
