/**
 * Declarative param fields: a producer describes its inputs so a generic param panel can render
 * them without knowing the algorithm (docs/PLAN.md §2b). Additive to apiVersion 1.
 */
export type ParamFieldKind = 'hex' | 'select';

export interface ParamFieldOption {
  value: string;
  labelKey: string;
}

export interface ParamField {
  /** Param name, e.g. `keyHex`. */
  name: string;
  labelKey: string;
  hintKey?: string;
  kind: ParamFieldKind;
  /** Choices of a `select` field. */
  options?: ParamFieldOption[];
}

/** The manifest parts param fields are derived from (see `PrimitiveManifest`). */
export interface ParamFieldSource {
  paramFields?: ParamField[];
  defaults: unknown;
  i18nNamespace: string;
}

const HEX_PARAM = /Hex$/;

/** Fallback for manifests without `paramFields`: string defaults named `…Hex`, labelled `<ns>.param.<name>`. */
export function inferHexFields(defaults: unknown, namespace: string): ParamField[] {
  if (typeof defaults !== 'object' || defaults === null) return [];
  return Object.entries(defaults)
    .filter(([name, value]) => HEX_PARAM.test(name) && typeof value === 'string')
    .map(([name]) => ({ name, labelKey: `${namespace}.param.${name}`, kind: 'hex' }));
}

/** The fields a param panel renders: declared `paramFields`, else inferred hex fields. */
export function paramFieldsOf(manifest: ParamFieldSource): ParamField[] {
  return manifest.paramFields ?? inferHexFields(manifest.defaults, manifest.i18nNamespace);
}

/** Every i18n key a field list references (labels, hints, option labels). */
export function paramFieldKeys(fields: readonly ParamField[]): string[] {
  return fields.flatMap((field) => [field.labelKey, ...(field.hintKey ? [field.hintKey] : []), ...(field.options ?? []).map((option) => option.labelKey)]);
}

/** Label key of the option matching `value`; `undefined` when none matches. */
export function optionLabelKey(field: ParamField, value: unknown): string | undefined {
  return field.options?.find((option) => option.value === value)?.labelKey;
}
