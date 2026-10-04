import { describe, expect, it } from 'vitest';
import { hashMessageBytes, messageLengths, paramError, readMessageInput, selectField } from './manifestKit.ts';

const NS = 'plugin.test';

describe('hashManifestKit', () => {
  it('labels a select field and its options under the namespace', () => {
    expect(selectField(NS, 'mode', ['a', 'b'])).toEqual({
      name: 'mode',
      kind: 'select',
      labelKey: `${NS}.param.mode`,
      hintKey: `${NS}.param.modeHint`,
      options: [
        { value: 'a', labelKey: `${NS}.param.modeOption.a` },
        { value: 'b', labelKey: `${NS}.param.modeOption.b` },
      ],
    });
  });

  it('builds namespaced param errors', () => {
    expect(paramError(NS, 'detail', { detail: 'x' })).toEqual({ ok: false, error: { key: `${NS}.error.detail`, params: { detail: 'x' } } });
  });

  it('lists the lengths 0 … max', () => {
    expect(messageLengths(3)).toEqual([0, 1, 2, 3]);
  });

  it('reads at most maxBytes in either encoding', () => {
    expect(readMessageInput(NS, 'AB cd', 'hex', 2)).toEqual({ ok: true, value: 'abcd' });
    expect(readMessageInput(NS, 'abcdef', 'hex', 2).ok).toBe(false);
    expect(readMessageInput(NS, 'abc', 'utf8', 3)).toEqual({ ok: true, value: 'abc' });
    expect(readMessageInput(NS, 'ää', 'utf8', 3)).toEqual({ ok: false, error: { key: `${NS}.error.inputLength`, params: { length: 4 } } });
    expect(readMessageInput(NS, 1, 'utf8', 3)).toEqual({ ok: false, error: { key: `${NS}.error.invalidParams` } });
  });

  it('decodes the message bytes of UTF-8 text or normalised hex', () => {
    expect(hashMessageBytes('utf8', 'aä')).toEqual([0x61, 0xc3, 0xa4]);
    expect(hashMessageBytes('hex', '616263')).toEqual([0x61, 0x62, 0x63]);
    expect(hashMessageBytes('hex', '')).toEqual([]);
  });
});
