import { describe, expect, it } from 'vitest';
import { BlockOpRecorder } from './blockOpRecorder.ts';
import { toyCipher } from '../modes/testCiphers.ts';
import { encryptInputLength, processedBytes, recordPadding, recordPaddedMode, unpaddedInputRegion } from './blockModeRecording.ts';
import { u8Regions } from './stepParts.ts';

const NS = 'plugin.demo';
type Op = { op: 'pad' | 'set' };
const recorderFor = (length: number) =>
  new BlockOpRecorder<'input', Op>([{ id: 'input', labelKey: 'x.input', elem: 'u8', shape: [length] }], { input: new Array<number>(length).fill(0) }, { key: 'x.initial' });

describe('encryptInputLength', () => {
  it('adds the PKCS#7 padding (a whole block for aligned data) or nothing without padding', () => {
    expect(encryptInputLength(3, 4, 'pkcs7')).toBe(4);
    expect(encryptInputLength(4, 4, 'pkcs7')).toBe(8);
    expect(encryptInputLength(3, 4, 'none')).toBe(3);
  });
});

describe('unpaddedInputRegion', () => {
  it('holds the data, then zeros where the padding goes', () => expect(unpaddedInputRegion([7, 8, 9], 4)).toEqual([7, 8, 9, 0]));
});

describe('recordPadding', () => {
  it('records the pad step at top level and returns the padded data', () => {
    const recorder = recorderFor(4);
    expect(recordPadding(recorder, NS, [1, 2, 3], 4, 'pkcs7')).toEqual({ padded: [1, 2, 3, 1], pad: { step: 0, bytes: [1] } });
    expect(recorder.toFacet().steps.map((step) => [step.op, step.scope])).toEqual([['pad', []]]);
  });

  it('records nothing without padding', () => {
    const recorder = recorderFor(4);
    expect(recordPadding(recorder, NS, [1, 2, 3, 4], 4, 'none')).toEqual({ padded: [1, 2, 3, 4] });
    expect(recorder.toFacet().steps).toEqual([]);
  });
});

describe('recordPaddedMode', () => {
  type Region = 'input' | 'output';
  type BlockOp = { op: 'emit' };
  const key = Uint8Array.of(0, 0, 0, 0);
  const regions = (length: number) => u8Regions<Region>(NS, { input: length, output: length }, ['output']);
  /** Copies each input block (decrypting: the toy cipher's inverse) into the output region. */
  const record = (direction: 'encrypt' | 'decrypt', data: number[], padding: 'pkcs7' | 'none') =>
    recordPaddedMode<Region, BlockOp, { input: number[]; output: number[] }>({
      namespace: NS,
      run: { cipher: toyCipher, key, data, direction, padding },
      regions,
      blockStep: ({ recorder, index, input, previous }) => {
        const output = Array.from(direction === 'encrypt' ? toyCipher.encryptBlock(key, Uint8Array.from(input)) : toyCipher.decryptBlock(key, Uint8Array.from(input)));
        recorder.op({ op: 'emit', writes: [{ region: 'output', offset: index * 4, values: output }], highlights: [], narration: { key: `${NS}.step.emit`, params: { previous: previous === undefined ? 0 : 1 } } });
        return { input, output };
      },
    });

  it('encrypts: pad at top level, then one block scope per (padded) block', () => {
    const recording = record('encrypt', [1, 2, 3, 4, 5], 'pkcs7');
    expect(recording.pad).toEqual({ step: 0, bytes: [3, 3, 3] });
    expect(recording.blocks.map((block) => block.input)).toEqual([[1, 2, 3, 4], [5, 3, 3, 3]]);
    expect(recording.facet.steps.map((step) => [step.op, step.scope])).toEqual([['pad', []], ['emit', [0, 0]], ['emit', [1, 0]]]);
    expect(recording.facet.initial['input']).toEqual([1, 2, 3, 4, 5, 0, 0, 0]);
    expect(recording.facet.initialNarration).toEqual({ key: `${NS}.step.initialEncrypt`, params: { bytes: 5, blockSize: 4, cipher: 'TOY' } });
    expect(recording.facet.steps.map((step) => step.narration.params?.['previous'])).toEqual([undefined, 0, 1]);
  });

  it('decrypts: unpad inside the last block, without failing on invalid padding', () => {
    const ciphertext = processedBytes(record('encrypt', [1, 2, 3, 4, 5], 'pkcs7'));
    const recording = record('decrypt', ciphertext, 'pkcs7');
    expect(recording.unpad).toMatchObject({ step: 2, result: { ok: true, padLength: 3 } });
    expect(processedBytes(recording)).toEqual([1, 2, 3, 4, 5, 3, 3, 3]);
    expect(recording.facet.steps.map((step) => [step.op, step.scope])).toEqual([['emit', [0, 0]], ['emit', [1, 0]], ['unpad', [1, 1]]]);
    expect(recording.facet.initialNarration).toEqual({ key: `${NS}.step.initialDecrypt`, params: { bytes: 8, count: 2, cipher: 'TOY' } });
    expect(record('decrypt', ciphertext.slice(0, 4), 'pkcs7').unpad?.result.ok).toBe(false);
  });

  it('records neither pad nor unpad without padding', () => {
    expect(record('encrypt', [1, 2, 3, 4], 'none')).not.toHaveProperty('pad');
    expect(record('decrypt', [1, 2, 3, 4], 'none')).not.toHaveProperty('unpad');
  });
});
