import { describe, expect, it } from 'vitest';
import type { Translate } from '@cryventure/core';
import { wordHeaders, wordLabel } from './wordHeaders.ts';

const t: Translate = (key, params) => `${typeof key === 'string' ? key : key.key}:${String(params?.['index'])}`;

describe('wordLabel', () => {
  it('uses w<i> notation', () => {
    expect(wordLabel(0)).toBe('w0');
    expect(wordLabel(43)).toBe('w43');
  });
});

describe('wordHeaders', () => {
  it('builds one header per word and marks the current ones', () => {
    expect(wordHeaders(3, new Set([1]), t)).toEqual([
      { text: 'w0', label: 'view.state.word:0', current: false },
      { text: 'w1', label: 'view.state.wordCurrent:1', current: true },
      { text: 'w2', label: 'view.state.word:2', current: false },
    ]);
  });
});
