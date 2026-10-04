import { parseHex, utf8Bytes, type ParamField } from '@cryventure/core';

/** The param that switches a producer's message field between UTF-8 and hex (docs/EXTENDING.md "Text params"). */
const TEXT_ENCODING_PARAM = 'encoding';

/** The one text field (the message) that `encoding` switches to hex; every other text field stays UTF-8 (e.g. cSHAKE N and S). */
const HEX_TEXT_FIELD = 'input';

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
 * The bytes `params[field.name]` stands for: hex-decoded when the field is `input` and
 * `params.encoding` is `'hex'` (as the producer validates it), else UTF-8.
 */
export function textFieldByteLength(field: Pick<ParamField, 'name'>, params: Readonly<Record<string, unknown>>): TextByteLength {
  const value = params[field.name];
  const unit = field.name === HEX_TEXT_FIELD && params[TEXT_ENCODING_PARAM] === 'hex' ? 'hex' : 'utf8';
  if (typeof value !== 'string') return { unit, bytes: undefined, valid: false };
  if (unit === 'utf8') return { unit, bytes: utf8Bytes(value).length, valid: true };
  const parsed = parseHex(value);
  if (parsed.ok) return { unit, bytes: parsed.bytes.length, valid: true };
  const digits = parsed.error.key === 'core.error.hexOddLength' ? parsed.error.params?.['length'] : undefined;
  return { unit, bytes: typeof digits === 'number' ? Math.floor(digits / 2) : undefined, valid: false };
}
