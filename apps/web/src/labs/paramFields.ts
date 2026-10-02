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

/** Label key for a producer output, following the `<namespace>.value.<name>` convention. */
export function outputLabelKey(producer: Pick<PrimitiveManifest, 'i18nNamespace'>, name: string): string {
  return `${producer.i18nNamespace}.value.${name}`;
}
