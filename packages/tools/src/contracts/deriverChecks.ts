import {
  alignIssues,
  assertManifestBasics,
  availableFacetKinds,
  getFacet,
  parseFacetKey,
  validateFieldFacet,
  validateInstructionsFacet,
  validateMathFacet,
  validateMemoryFacet,
  validateRegistersFacet,
  validateTableFacet,
  type AlignSpan,
  type AnyStateFacet,
  type DeriverManifest,
  type FacetKind,
  type I18nRef,
  type MemoryFacet,
  type TraceBundle,
  type ValuesFacet,
} from '@cryventure/core';

/**
 * Pure checks for deriver plugins (docs/M4.md §7); each returns human-readable problems
 * (empty = pass). Derived facets are walked generically, so a new facet kind is covered as long as
 * it follows the shared conventions: `align` spans on its own steps, `valueRef` ids, `{ key, params }` refs.
 */

/** What `derive()` returns: facets keyed `kind@variant`. */
export type DerivedFacets = Partial<Record<string, unknown>>;

/** Manifest problems: core basics, `kind: 'deriver'`, a non-empty `provides` and a `load` function. */
export function deriverManifestProblems(manifest: DeriverManifest): string[] {
  const problems: string[] = [];
  try {
    assertManifestBasics(manifest);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  if (manifest.kind !== 'deriver') problems.push(`kind is "${String(manifest.kind)}", expected "deriver"`);
  if (!Array.isArray(manifest.provides) || manifest.provides.length === 0) problems.push('provides no facet kind');
  if (typeof manifest.load !== 'function') problems.push('has no load() function');
  return problems;
}

/** The runtime's applicability rule (docs/M4.md §1c): `from` ⊆ the bundle's kinds and `appliesTo` (default true). */
export function appliesToBundle(manifest: Pick<DeriverManifest, 'from' | 'appliesTo'>, bundle: TraceBundle): boolean {
  const kinds = new Set(availableFacetKinds(bundle));
  return manifest.from.every((kind) => kinds.has(kind)) && (manifest.appliesTo?.(bundle) ?? true);
}

/** Keys that are not `kind@variant`, kinds outside `provides`, and provided kinds `derive()` did not return. */
export function derivedKindProblems(provides: readonly FacetKind[], facets: DerivedFacets): string[] {
  const keys = Object.keys(facets);
  const kinds = keys.map((key) => parseFacetKey(key)?.kind);
  const badKeys = keys.filter((_, index) => kinds[index] === undefined).map((key) => `key "${key}" is not kind@variant`);
  const unprovided = keys.filter((_, index) => kinds[index] !== undefined && !provides.includes(kinds[index])).map((key) => `key "${key}" is not a provided kind (${provides.join(', ')})`);
  const missing = provides.filter((kind) => !kinds.includes(kind)).map((kind) => `provided kind "${kind}" was not returned`);
  return [...badKeys, ...unprovided, ...missing];
}

type FacetValidator = (facet: never) => string[];

/** Core schema validators by facet kind; kinds without one are only checked by the generic walks. */
export const FACET_VALIDATORS: Readonly<Partial<Record<FacetKind, FacetValidator>>> = {
  instructions: validateInstructionsFacet,
  registers: validateRegistersFacet,
  memory: validateMemoryFacet,
  field: validateFieldFacet,
  math: validateMathFacet,
  table: validateTableFacet,
};

/** Lowercase hex address as a bigint, or undefined for anything else. */
function hexAddress(text: unknown): bigint | undefined {
  return typeof text === 'string' && /^0x[0-9a-f]+$/.test(text) ? BigInt(text) : undefined;
}

/** The allocation whose address range contains `addr` (undefined for malformed addresses). */
function allocationContaining(facet: MemoryFacet, addr: string) {
  const start = hexAddress(addr);
  if (start === undefined) return undefined;
  return facet.allocations.find((allocation) => {
    const base = hexAddress(allocation.addr);
    return base !== undefined && base <= start && start < base + BigInt(allocation.size);
  });
}

/**
 * Memory writes outside their allocation's lifetime (core's validator does not check it): a write
 * must start at or after `allocatedAt` and, when the allocation is freed, end before `freedAt`.
 * Writes outside every allocation are left to the core validator.
 */
export function memoryLifetimeProblems(facet: MemoryFacet): string[] {
  return facet.writes.flatMap(({ align, addr }, index) => {
    const allocation = allocationContaining(facet, addr);
    if (allocation === undefined) return [];
    const where = `memory: write ${index} (steps ${align.first}..${align.last})`;
    const problems: string[] = [];
    if (align.first < allocation.allocatedAt) problems.push(`${where} starts before allocation "${allocation.id}" exists (allocatedAt ${allocation.allocatedAt})`);
    if (allocation.freedAt !== undefined && align.last >= allocation.freedAt) problems.push(`${where} is not done before allocation "${allocation.id}" is freed (freedAt ${allocation.freedAt})`);
    return problems;
  });
}

/** Kit checks beyond the core validators, by facet kind (run only when the core validator passes). */
export const FACET_KIT_CHECKS: Readonly<Partial<Record<FacetKind, FacetValidator>>> = {
  memory: memoryLifetimeProblems,
};

/** Problems of one validator on a facet, a throwing validator reported as a malformed facet. */
function validatorProblems(key: string, facet: unknown, validate: FacetValidator): string[] {
  try {
    return validate(facet as never).map((issue) => `${key}: ${issue}`);
  } catch (error) {
    return [`${key}: validator threw (${error instanceof Error ? error.message : String(error)}); malformed facet`];
  }
}

/**
 * Schema problems of every derived facet whose kind has a core validator (a throwing validator is a
 * problem too), then the kit's extra checks of that kind once the schema holds.
 */
export function derivedSchemaProblems(facets: DerivedFacets): string[] {
  return Object.entries(facets).flatMap(([key, facet]) => {
    const kind = parseFacetKey(key)?.kind ?? '';
    const validate = FACET_VALIDATORS[kind];
    const schema = validate === undefined ? [] : validatorProblems(key, facet, validate);
    const extra = FACET_KIT_CHECKS[kind];
    return schema.length > 0 || extra === undefined ? schema : validatorProblems(key, facet, extra);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every value reachable in a JSON-like tree (depth first, the root included). */
function walk(value: unknown, visit: (node: unknown) => void): void {
  visit(value);
  if (Array.isArray(value)) value.forEach((item) => walk(item, visit));
  else if (isRecord(value)) Object.values(value).forEach((item) => walk(item, visit));
}

function isAlignSpan(value: unknown): value is AlignSpan {
  return isRecord(value) && typeof value['first'] === 'number' && typeof value['last'] === 'number';
}

function hasAlignObject(item: unknown): item is Record<string, unknown> & { align: Record<string, unknown> } {
  return isRecord(item) && isRecord(item['align']);
}

/**
 * Arrays of steps (instructions, register steps, memory writes, …): every array in which any item
 * carries an `align` object. A numeric `align` (the byte alignment of allocations and layouts) is not a span.
 */
function alignedArrays(facet: unknown): unknown[][] {
  const arrays: unknown[][] = [];
  walk(facet, (node) => {
    if (Array.isArray(node) && node.some(hasAlignObject)) arrays.push(node);
  });
  return arrays;
}

/**
 * Each array of aligned steps as one span sequence (items without an `align` object are left out and
 * reported by `missingAlignProblems`; malformed spans become NaN).
 */
export function alignSpanSequences(facet: unknown): AlignSpan[][] {
  return alignedArrays(facet).map((items) =>
    items.filter(hasAlignObject).map((item) => (isAlignSpan(item.align) ? item.align : { first: Number.NaN, last: Number.NaN })),
  );
}

/** Items of an aligned-steps array that carry no `align` object. */
export function missingAlignProblems(facet: unknown): string[] {
  return alignedArrays(facet).flatMap((items) =>
    items.flatMap((item, index) => (hasAlignObject(item) ? [] : [`align: item ${index} of an aligned array has no align span`])),
  );
}

/** The number of state steps a bundle's spans may refer to (0 without a state facet). */
export function stateStepCount(bundle: TraceBundle): number {
  return getFacet<AnyStateFacet>(bundle, 'state')?.steps.length ?? 0;
}

/** `alignIssues` of every span sequence in the derived facets, against `stepCount` state steps. */
export function derivedAlignProblems(facets: DerivedFacets, stepCount: number): string[] {
  return Object.entries(facets).flatMap(([key, facet]) => {
    const spanIssues = alignSpanSequences(facet).flatMap((spans) => alignIssues(spans, stepCount));
    return [...missingAlignProblems(facet), ...spanIssues].map((issue) => `${key}: ${issue}`);
  });
}

/** Every `valueRef` id in a tree (operands, register writes, memory allocations/refs/writes, field terms, …). */
export function valueRefsIn(value: unknown): string[] {
  const refs = new Set<string>();
  walk(value, (node) => {
    if (isRecord(node) && typeof node['valueRef'] === 'string') refs.add(node['valueRef']);
  });
  return [...refs];
}

/** `valueRef` ids in the derived facets that the bundle's `values` facet does not declare. */
export function unknownValueRefProblems(facets: DerivedFacets, bundle: TraceBundle): string[] {
  const known = new Set(getFacet<ValuesFacet>(bundle, 'values')?.values.map((value) => value.id) ?? []);
  return Object.entries(facets).flatMap(([key, facet]) =>
    valueRefsIn(facet)
      .filter((id) => !known.has(id))
      .map((id) => `${key}: valueRef "${id}" is not in the values facet`),
  );
}

function isI18nRef(value: unknown): value is I18nRef {
  if (!isRecord(value) || typeof value['key'] !== 'string') return false;
  const params = value['params'];
  const paramsOk = params === undefined || (isRecord(params) && Object.values(params).every((param) => typeof param === 'string' || typeof param === 'number'));
  return paramsOk && Object.keys(value).every((name) => name === 'key' || name === 'params');
}

/**
 * Fields that hold an `I18nRef` per facet kind, as paths (`[]` = every item of an array). A value at
 * such a path must be a ref; absent optional fields are skipped (the schema decides whether they are required).
 */
export const KNOWN_REF_FIELDS: Readonly<Partial<Record<FacetKind, readonly string[]>>> = {
  state: ['initialNarration', 'steps[].narration'],
  narration: ['entries[].ref'],
  instructions: ['label', 'instructions[].note', 'instructions[].covers[]'],
  registers: ['label'],
  memory: ['label', 'impl.label', 'allocations[].label'],
  derivation: ['nodes[].label', 'groups[].label'],
  math: ['steps[].formula', 'steps[].terms[].label'],
  field: ['steps[].formula', 'steps[].terms[].label'],
  table: ['title'],
  chain: ['formula', 'nodes[].label'],
  wire: ['segments[].label'],
};

/** Every value at `path` below `value`, with its concrete location (`a[1].b`); absent values are skipped. */
function valuesAt(value: unknown, path: readonly string[], where = ''): { where: string; value: unknown }[] {
  const [segment, ...rest] = path;
  if (segment === undefined) return [{ where, value }];
  const name = segment.endsWith('[]') ? segment.slice(0, -2) : segment;
  const child = isRecord(value) ? value[name] : undefined;
  const at = where === '' ? name : `${where}.${name}`;
  if (child === undefined) return [];
  if (!segment.endsWith('[]')) return valuesAt(child, rest, at);
  return Array.isArray(child) ? child.flatMap((item, index) => valuesAt(item, rest, `${at}[${index}]`)) : [];
}

/** Values in the known ref fields of each derived facet's kind that are not `{ key, params? }` refs. */
export function malformedRefProblems(facets: DerivedFacets): string[] {
  return Object.entries(facets).flatMap(([key, facet]) =>
    (KNOWN_REF_FIELDS[parseFacetKey(key)?.kind ?? ''] ?? [])
      .flatMap((path) => valuesAt(facet, path.split('.')))
      .filter(({ value }) => !isI18nRef(value))
      .map(({ where }) => `${key}: ${where} is not an I18nRef { key, params? }`),
  );
}

/**
 * Every message ref in a tree, deduplicated: the generic fallback that finds refs in any field,
 * accepting only objects of exactly `{ key }` or `{ key, params }` (`malformedRefProblems` covers the known fields).
 */
export function i18nRefsIn(value: unknown): I18nRef[] {
  const refs = new Map<string, I18nRef>();
  walk(value, (node) => {
    if (isI18nRef(node)) refs.set(JSON.stringify(node), node);
  });
  return [...refs.values()];
}

/** Refs whose key lies outside the deriver's namespace (`deriver.<id>.`). */
export function refsOutsideNamespace(refs: readonly I18nRef[], namespace: string): string[] {
  return refs.filter((ref) => !ref.key.startsWith(`${namespace}.`)).map((ref) => `ref "${ref.key}" is outside ${namespace}.*`);
}

/** The deriver's message namespace (a convention checked by the kit, not a manifest field). */
export function deriverNamespace(id: string): string {
  return `deriver.${id}`;
}
