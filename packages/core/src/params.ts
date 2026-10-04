/**
 * Declarative param fields: a producer describes its inputs so a generic param panel can render
 * them without knowing the algorithm (docs/PLAN.md §2b). Additive to apiVersion 1.
 */
import { utf8Bytes } from './bytes.ts';
import { parsePortMemberRef, type MacConstruction, type PortName } from './ports.ts';

/**
 * `hex`: bytes as hex. `select`: one of `options`. `port`: the id of a producer that implements
 * `port`, or with `member: true` a member ref naming one of its functions (options come from the
 * registry, see `portOptions`). `text`: a UTF-8 string of at most `maxLength` bytes.
 */
export type ParamFieldKind = 'hex' | 'select' | 'port' | 'text';

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
  /** The port a `port` field's producer must implement. */
  port?: PortName;
  /** A `port` field whose value is a member ref `"<producerId>:<memberId>"` (`Hash` or `Mac`, docs/M7.md §1b). */
  member?: true;
  /** `Mac` member fields: the constructions offered; absent = all. */
  constructions?: readonly MacConstruction['kind'][];
  /** Maximum length of a `text` field in UTF-8 bytes. */
  maxLength?: number;
}

/** A `port` field with its port name. */
export type PortParamField = ParamField & { kind: 'port'; port: PortName };

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

/** Option label keys the producer's own catalogs must hold: none for `port` fields (they use producer titles). */
function ownOptionKeys(field: ParamField): string[] {
  return field.kind === 'port' ? [] : (field.options ?? []).map((option) => option.labelKey);
}

/** Every i18n key a field list references (labels, hints, option labels). */
export function paramFieldKeys(fields: readonly ParamField[]): string[] {
  return fields.flatMap((field) => [field.labelKey, ...(field.hintKey ? [field.hintKey] : []), ...ownOptionKeys(field)]);
}

/** The `port` fields of a field list (fields without a `port` name are skipped). */
export function portParamFields(fields: readonly ParamField[]): PortParamField[] {
  return fields.filter((field): field is PortParamField => field.kind === 'port' && field.port !== undefined);
}

/** Param validation for a `text` field: `input` if it is a string of at most `maxLength` UTF-8 bytes, else `undefined`. */
export function readText(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string') return undefined;
  return utf8Bytes(input).length <= maxLength ? input : undefined;
}

const PRODUCER_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Param validation for a `port` field: `input` if it is a kebab-case producer id, else `undefined` (existence is checked at run time by `requirePort`). */
export function readProducerId(input: unknown): string | undefined {
  return typeof input === 'string' && PRODUCER_ID.test(input) ? input : undefined;
}

/**
 * Param validation for a member `port` field: `input` if it is a member ref with a kebab-case
 * producer id and a non-empty member id, else `undefined` (existence is checked at run time by
 * `requirePortMember`).
 */
export function readPortMemberRef(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const parts = parsePortMemberRef(input);
  return parts !== undefined && readProducerId(parts.producerId) !== undefined ? input : undefined;
}

/** Label key of the option matching `value`; `undefined` when none matches. */
export function optionLabelKey(field: ParamField, value: unknown): string | undefined {
  return field.options?.find((option) => option.value === value)?.labelKey;
}

/**
 * Param validation for a closed set of string options: `input` if it is one of `allowed`, `fallback`
 * when `input` is absent (`undefined`) and a fallback is given, else `undefined` (an invalid value).
 */
export function readOption<T extends string>(input: unknown, allowed: readonly T[], fallback?: T): T | undefined {
  if (input === undefined) return fallback;
  return allowed.find((option) => option === input);
}
