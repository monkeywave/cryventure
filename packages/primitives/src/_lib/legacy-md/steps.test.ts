import { describe, expect, it } from 'vitest';
import { MD5_ALGORITHM } from './md5Detail.ts';
import { termFactory } from '../sha2/wordTerms.ts';
import { WORD32 } from '../sha2/words.ts';
import { legacyInitialNarration, specTerm } from './steps.ts';

const NS = 'plugin.test';
const trace = { term: termFactory(NS, WORD32) };

describe('specTerm', () => {
  it('labels the term under the namespace and writes its hex', () => {
    expect(specTerm(trace, { id: 'x', label: 'x', word: 0x1a, role: 'operand', params: { k: 3 } })).toEqual({ id: 'x', label: { key: `${NS}.term.x`, params: { k: 3 } }, hex: '0000001a', role: 'operand' });
  });

  it('adds op, valueRef and the story emphasis when given', () => {
    expect(specTerm(trace, { id: 'T', label: 'T', word: 1, role: 'result', op: 'add', story: true }, 'h/1')).toEqual({
      id: 'T',
      label: { key: `${NS}.term.T` },
      hex: '00000001',
      role: 'result',
      op: 'add',
      valueRef: 'h/1',
      emphasis: 'story',
    });
  });
});

describe('legacyInitialNarration', () => {
  it('names the message size, digest bits, block bits and rounds', () => {
    expect(legacyInitialNarration({ ns: NS, algorithm: MD5_ALGORITHM }, 3)).toEqual({ key: `${NS}.step.initial`, params: { bytes: 3, bits: 128, blockBits: 512, rounds: 64 } });
  });
});
