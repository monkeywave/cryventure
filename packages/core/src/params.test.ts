import { describe, expect, it } from 'vitest';
import { inferHexFields, optionLabelKey, paramFieldKeys, paramFieldsOf, type ParamField } from './params.ts';

const detail: ParamField = {
  name: 'detail',
  labelKey: 'plugin.x.param.detail',
  hintKey: 'plugin.x.param.detailHint',
  kind: 'select',
  options: [
    { value: 'op', labelKey: 'plugin.x.param.detailOption.op' },
    { value: 'round', labelKey: 'plugin.x.param.detailOption.round' },
  ],
};

describe('inferHexFields', () => {
  it('picks string defaults named …Hex in declaration order', () => {
    expect(inferHexFields({ keyHex: '00', countHex: 3, ivHex: '01', mode: 'x' }, 'plugin.x')).toEqual([
      { name: 'keyHex', labelKey: 'plugin.x.param.keyHex', kind: 'hex' },
      { name: 'ivHex', labelKey: 'plugin.x.param.ivHex', kind: 'hex' },
    ]);
  });

  it('is empty for non-object defaults', () => {
    expect(inferHexFields(null, 'plugin.x')).toEqual([]);
  });
});

describe('paramFieldsOf', () => {
  it('prefers declared fields', () => {
    expect(paramFieldsOf({ paramFields: [detail], defaults: { keyHex: '00' }, i18nNamespace: 'plugin.x' })).toEqual([detail]);
  });

  it('falls back to inferred hex fields', () => {
    expect(paramFieldsOf({ defaults: { keyHex: '00' }, i18nNamespace: 'plugin.x' }).map((field) => field.name)).toEqual(['keyHex']);
  });
});

describe('paramFieldKeys', () => {
  it('lists label, hint and option keys', () => {
    expect(paramFieldKeys([detail])).toEqual(['plugin.x.param.detail', 'plugin.x.param.detailHint', 'plugin.x.param.detailOption.op', 'plugin.x.param.detailOption.round']);
  });
});

describe('optionLabelKey', () => {
  it('finds the option label for a value', () => {
    expect(optionLabelKey(detail, 'round')).toBe('plugin.x.param.detailOption.round');
    expect(optionLabelKey(detail, 'nope')).toBeUndefined();
  });
});
