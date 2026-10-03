import { describe, expect, it } from 'vitest';
import { DEFAULT_IV_HEX, DEFAULT_KEY_HEX, parseBlockHex } from './blockInput.ts';

describe('parseBlockHex', () => {
  it('accepts the defaults and tolerant hex (spaces, upper case)', () => {
    expect(parseBlockHex(DEFAULT_KEY_HEX, 'key')).toMatchObject({ ok: true, hex: DEFAULT_KEY_HEX });
    expect(parseBlockHex(DEFAULT_IV_HEX, 'iv').ok).toBe(true);
    expect(parseBlockHex('2B7E1516 28AED2A6 ABF71588 09CF4F3C', 'key')).toMatchObject({ ok: true, hex: DEFAULT_KEY_HEX });
  });

  it('reports a wrong length with the field-specific key and the byte count', () => {
    expect(parseBlockHex('00ff', 'key')).toEqual({ ok: false, error: { key: 'ui.penguin.error.keyLength', params: { length: 2 } } });
    expect(parseBlockHex('', 'iv')).toEqual({ ok: false, error: { key: 'ui.penguin.error.ivLength', params: { length: 0 } } });
  });

  it('passes hex syntax errors through as core errors', () => {
    expect(parseBlockHex('zz', 'key')).toMatchObject({ ok: false, error: { key: 'core.error.hexInvalidChar' } });
    expect(parseBlockHex('abc', 'iv')).toMatchObject({ ok: false, error: { key: 'core.error.hexOddLength' } });
  });
});
