import type { ParamField, PrimitiveManifest, ValidationResult } from '@cryventure/core';
import type { LabParams } from './labSession.ts';

/** Generic hint for hex fields whose producer declares none. */
export const HEX_HINT_KEY = 'ui.lab.params.hexHint';

/** Validates `params` with one field replaced by the user's input (other fields stay committed). */
export function editField(producer: PrimitiveManifest<LabParams>, params: LabParams, field: string, text: string): ValidationResult<LabParams> {
  return producer.validate({ ...params, [field]: text });
}

/** The field's own hint, else the generic hex hint for hex fields; `undefined` when there is none. */
export function hintKeyOf(field: ParamField): string | undefined {
  return field.hintKey ?? (field.kind === 'hex' ? HEX_HINT_KEY : undefined);
}

/** The producer-declared label key of an output (`manifest.outputs`); `undefined` when it declares none. */
export function outputLabelKey(producer: Pick<PrimitiveManifest, 'outputs'>, name: string): string | undefined {
  return producer.outputs?.[name]?.labelKey;
}
