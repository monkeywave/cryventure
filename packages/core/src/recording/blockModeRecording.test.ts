import { describe, expect, it } from 'vitest';
import { BlockOpRecorder } from './blockOpRecorder.ts';
import { encryptInputLength, recordPadding, unpaddedInputRegion } from './blockModeRecording.ts';

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
