import { describe, expect, it } from 'vitest';
import { textFieldByteLength } from './textParams.ts';

const input = { name: 'input', encodingParam: 'encoding' };

describe('textFieldByteLength', () => {
  it("counts UTF-8 bytes unless the producer's `encoding` param is hex", () => {
    expect(textFieldByteLength(input, { input: 'äö' })).toEqual({ unit: 'utf8', bytes: 4, valid: true });
    expect(textFieldByteLength(input, { input: 'äö', encoding: 'utf8' })).toEqual({ unit: 'utf8', bytes: 4, valid: true });
  });

  it('counts the decoded bytes of hex text, ignoring separators', () => {
    expect(textFieldByteLength(input, { input: '00 '.repeat(100).trim(), encoding: 'hex' })).toEqual({ unit: 'hex', bytes: 100, valid: true });
    expect(textFieldByteLength(input, { input: '', encoding: 'hex' })).toEqual({ unit: 'hex', bytes: 0, valid: true });
  });

  it('counts the complete bytes of odd-length hex and leaves invalid hex uncounted, both invalid', () => {
    expect(textFieldByteLength(input, { input: '616', encoding: 'hex' })).toEqual({ unit: 'hex', bytes: 1, valid: false });
    expect(textFieldByteLength(input, { input: 'zz', encoding: 'hex' })).toEqual({ unit: 'hex', bytes: undefined, valid: false });
  });

  it('measures only a field that declares `encodingParam` in hex; other text fields stay UTF-8 (e.g. cSHAKE S)', () => {
    expect(textFieldByteLength({ name: 'customization' }, { customization: 'Email Signature', encoding: 'hex' })).toEqual({ unit: 'utf8', bytes: 15, valid: true });
  });

  it('marks a missing or non-string value invalid', () => {
    expect(textFieldByteLength(input, {})).toEqual({ unit: 'utf8', bytes: undefined, valid: false });
    expect(textFieldByteLength(input, { input: 7, encoding: 'hex' })).toEqual({ unit: 'hex', bytes: undefined, valid: false });
  });
});

describe('textFieldByteLength: the encodingParam declaration (docs/M7.md §1e)', () => {
  it('follows the declared sibling param, whatever the field and the param are named', () => {
    const password = { name: 'password', encodingParam: 'passwordEncoding' };
    expect(textFieldByteLength(password, { password: 'a3a3', passwordEncoding: 'hex' })).toEqual({ unit: 'hex', bytes: 2, valid: true });
    expect(textFieldByteLength(password, { password: 'a3a3', passwordEncoding: 'utf8', encoding: 'hex' })).toEqual({ unit: 'utf8', bytes: 4, valid: true });
  });

  it('no longer treats an undeclared `input` field as hex (the name convention is gone)', () => {
    expect(textFieldByteLength({ name: 'input' }, { input: 'a3a3', encoding: 'hex' })).toEqual({ unit: 'utf8', bytes: 4, valid: true });
  });
});
