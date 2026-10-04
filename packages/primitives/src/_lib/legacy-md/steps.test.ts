import { describe, expect, it } from 'vitest';
import { MD5_ALGORITHM } from './md5Detail.ts';
import { chainingValueId, legacyInitialNarration, legacyTerm } from './steps.ts';

const NS = 'plugin.test';

describe('legacyTerm', () => {
  it('labels the term under the namespace and writes its hex', () => {
    expect(legacyTerm(NS, { id: 'x', label: 'x', word: 0x1a, role: 'operand', params: { k: 3 } })).toEqual({ id: 'x', label: { key: `${NS}.term.x`, params: { k: 3 } }, hex: '0000001a', role: 'operand' });
  });

  it('adds op, valueRef and the story emphasis when given', () => {
    expect(legacyTerm(NS, { id: 'T', label: 'T', word: 1, role: 'result', op: 'add', story: true }, 'h/1')).toEqual({
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

describe('chainingValueId', () => {
  it('is iv before block 1 and h/<n> after block n', () => {
    expect([chainingValueId(0), chainingValueId(1), chainingValueId(2)]).toEqual(['iv', 'h/1', 'h/2']);
  });
});

describe('legacyInitialNarration', () => {
  it('names the message size, digest bits, block bits and rounds', () => {
    expect(legacyInitialNarration({ ns: NS, algorithm: MD5_ALGORITHM }, 3)).toEqual({ key: `${NS}.step.initial`, params: { bytes: 3, bits: 128, blockBits: 512, rounds: 64 } });
  });
});
