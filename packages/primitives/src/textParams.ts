import { parseHex, utf8Bytes, type ParamField } from '@cryventure/core';

/**
 * How a `text` field's value measures against `maxLength`. `bytes` is `undefined` when the value is
 * not a string or not hex; odd-length hex counts its complete bytes. `valid` is true only for a value
 * the producer accepts in that unit (a string; complete hex).
 */
export interface TextByteLength {
  unit: 'utf8' | 'hex';
  bytes: number | undefined;
  valid: boolean;
}

/**
 * The bytes `params[field.name]` stands for: hex-decoded when the field declares an
 * `encodingParam` whose value in `params` is `'hex'` (as the producer validates it), else UTF-8
 * (docs/EXTENDING.md "Text params").
 */
export function textFieldByteLength(field: Pick<ParamField, 'name' | 'encodingParam'>, params: Readonly<Record<string, unknown>>): TextByteLength {
  const value = params[field.name];
  const unit = field.encodingParam !== undefined && params[field.encodingParam] === 'hex' ? 'hex' : 'utf8';
  if (typeof value !== 'string') return { unit, bytes: undefined, valid: false };
  if (unit === 'utf8') return { unit, bytes: utf8Bytes(value).length, valid: true };
  const parsed = parseHex(value);
  if (parsed.ok) return { unit, bytes: parsed.bytes.length, valid: true };
  const digits = parsed.error.key === 'core.error.hexOddLength' ? parsed.error.params?.['length'] : undefined;
  return { unit, bytes: typeof digits === 'number' ? Math.floor(digits / 2) : undefined, valid: false };
}
