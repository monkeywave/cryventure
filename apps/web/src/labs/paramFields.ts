import { optionLabelKey, parseHex, portOptions, utf8Bytes, type ParamField, type PrimitiveManifest, type ValidationResult } from '@cryventure/core';
import type { LabParams } from './labSession.ts';

/** Generic hint for hex fields whose producer declares none. */
export const HEX_HINT_KEY = 'ui.lab.params.hexHint';

/** Validates `params` with `patch` merged over it (a view's re-run request; untouched fields stay committed). */
export function mergeParams(producer: PrimitiveManifest<LabParams>, params: LabParams, patch: Readonly<Record<string, unknown>>): ValidationResult<LabParams> {
  return producer.validate({ ...params, ...patch });
}

/** Validates `params` with one field replaced by the user's input (other fields stay committed). */
export function editField(producer: PrimitiveManifest<LabParams>, params: LabParams, field: string, text: string): ValidationResult<LabParams> {
  return mergeParams(producer, params, { [field]: text });
}

/** The field's own hint, else the generic hex hint for hex fields; `undefined` when there is none. */
export function hintKeyOf(field: ParamField): string | undefined {
  return field.hintKey ?? (field.kind === 'hex' ? HEX_HINT_KEY : undefined);
}

/** The producer-declared label key of an output (`manifest.outputs`); `undefined` when it declares none. */
export function outputLabelKey(producer: Pick<PrimitiveManifest, 'outputs'>, name: string): string | undefined {
  return producer.outputs?.[name]?.labelKey;
}

/**
 * Label key of a choice field's current value: a `select` option, or the title of the producer a
 * `port` field names (among `producers`); `undefined` for other kinds or an unknown value.
 */
export function choiceLabelKey(field: ParamField, value: unknown, producers: readonly PrimitiveManifest[]): string | undefined {
  if (field.kind === 'select') return optionLabelKey(field, value);
  if (field.kind !== 'port' || field.port === undefined) return undefined;
  return portOptions(producers, field.port).find((option) => option.value === value)?.labelKey;
}

/**
 * The param that switches a producer's message field between UTF-8 and hex (docs/EXTENDING.md "Text
 * params"): while it is `'hex'`, the `input` field's `maxLength` counts the decoded bytes, as the producer validates them.
 */
export const TEXT_ENCODING_PARAM = 'encoding';

/** The one text field (the message) that `encoding` switches to hex; every other text field stays UTF-8 (e.g. cSHAKE N and S). */
export const HEX_TEXT_FIELD = 'input';

/** How a `text` field's draft measures against `maxLength`; `bytes` is `undefined` for text that is not hex. */
export interface TextLength {
  unit: 'utf8' | 'hex';
  bytes: number | undefined;
}

/**
 * The bytes the text of field `name` stands for: hex-decoded (complete bytes only) when the field is
 * `input` and `params.encoding` is `'hex'`, else UTF-8. The contract kit mirrors this rule
 * (`textFieldProblems` in packages/tools/src/contracts/portChecks.ts).
 */
export function textFieldLength(name: string, text: string, params: Readonly<Record<string, unknown>>): TextLength {
  if (name !== HEX_TEXT_FIELD || params[TEXT_ENCODING_PARAM] !== 'hex') return { unit: 'utf8', bytes: utf8Bytes(text).length };
  const parsed = parseHex(text);
  if (parsed.ok) return { unit: 'hex', bytes: parsed.bytes.length };
  const digits = parsed.error.key === 'core.error.hexOddLength' ? parsed.error.params?.['length'] : undefined;
  return { unit: 'hex', bytes: typeof digits === 'number' ? Math.floor(digits / 2) : undefined };
}
