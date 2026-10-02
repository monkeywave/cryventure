/* eslint-disable max-lines-per-function -- these functions return whole source files as template literals; their length is content, not logic. */
import type { ConformanceVectors } from '../contracts/conformance.ts';
import { toCamelCase, toConstantCase, toPascalCase } from './naming.ts';

/** Pure file templates for `pnpm cv new …`; paths are relative to the repo root. */
export interface ScaffoldFile {
  path: string;
  content: string;
}

export const DE_STUB_PREFIX = '[DE] ';

/** Pretty-printed JSON with a trailing newline, as stored in the repo. */
export function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** A TypeScript array literal of single-quoted strings, e.g. `['state', 'values']`. */
export function tsStringArray(items: readonly string[]): string {
  return `[${items.map((item) => `'${item}'`).join(', ')}]`;
}

/** DE stubs mirror EN with a `[DE] ` prefix so the parity check flags them as untranslated. */
export function deStubs(en: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(en).map(([key, value]) => [key, `${DE_STUB_PREFIX}${value}`]));
}

export function primitiveFolder(id: string): string {
  return `packages/primitives/src/${id}`;
}

export function viewFolder(id: string): string {
  return `packages/views/src/${id}`;
}

// ---------------------------------------------------------------------------------------------
// Primitive
// ---------------------------------------------------------------------------------------------

export function primitiveMessages(id: string): Record<string, string> {
  const ns = `plugin.${id}`;
  return {
    [`${ns}.title`]: `${toPascalCase(id)} (toy XOR cipher – replace me)`,
    [`${ns}.preset.example`]: 'Example key and block',
    [`${ns}.preset.zero-key`]: 'All-zero key (output equals input)',
    [`${ns}.param.key`]: 'Key (hex)',
    [`${ns}.param.input`]: 'Input block (hex)',
    [`${ns}.param.blockHint`]: 'Exactly 16 bytes as hex digits; spaces and colons are ignored.',
    [`${ns}.region.state`]: 'State',
    [`${ns}.region.key`]: 'Key',
    [`${ns}.value.key`]: 'Key',
    [`${ns}.value.input`]: 'Input block',
    [`${ns}.value.output`]: 'Output block',
    [`${ns}.op.load`]: 'Load – copy the input block into the state',
    [`${ns}.op.xor`]: 'XOR – combine the state with the key',
    [`${ns}.opShort.load`]: 'Load',
    [`${ns}.opShort.xor`]: 'XOR',
    [`${ns}.step.load`]: 'The input block is loaded into the state.',
    [`${ns}.step.xor`]: 'All {{count}} state bytes are XORed with the matching key bytes.',
    [`${ns}.error.invalidParams`]: 'Give the key and the input block as hex text.',
    [`${ns}.error.keyLength`]: 'The key has {{length}} bytes; it needs exactly 16.',
    [`${ns}.error.inputLength`]: 'The input block has {{length}} bytes; it needs exactly 16.',
  };
}

function primitiveManifestSource(id: string, family: string): string {
  const pascal = toPascalCase(id);
  const camel = toCamelCase(id);
  return `import { definePrimitive, i18nRef, parseHexOfLength, type HexOfLengthResult, type OpLabels, type ParamField, type Preset, type ValidationResult } from '@cryventure/core';

/** Manifest for the ${id} primitive. Imports core only; the implementation loads lazily. */
export interface ${pascal}Params {
  keyHex: string;
  inputHex: string;
}

const NS = 'plugin.${id}';
export const ${toConstantCase(id)}_BLOCK_BYTES = 16;

const EXAMPLE: ${pascal}Params = { keyHex: '000102030405060708090a0b0c0d0e0f', inputHex: '00112233445566778899aabbccddeeff' };

export const ${toConstantCase(id)}_PRESETS: Preset<${pascal}Params>[] = [
  { id: 'example', labelKey: \`\${NS}.preset.example\`, params: EXAMPLE },
  { id: 'zero-key', labelKey: \`\${NS}.preset.zero-key\`, params: { ...EXAMPLE, keyHex: '00'.repeat(${toConstantCase(id)}_BLOCK_BYTES) } },
];

/** Inputs for the generic param panel (label/hint keys must exist in EN and DE; the contract kit checks). */
export const ${toConstantCase(id)}_PARAM_FIELDS: ParamField[] = [
  { name: 'keyHex', kind: 'hex', labelKey: \`\${NS}.param.key\`, hintKey: \`\${NS}.param.blockHint\` },
  { name: 'inputHex', kind: 'hex', labelKey: \`\${NS}.param.input\`, hintKey: \`\${NS}.param.blockHint\` },
];

/** Labels of every op the module records (\`StateStep.op\`); the player and debugger show them. */
export const ${toConstantCase(id)}_OPS: Record<'load' | 'xor', OpLabels> = {
  load: { labelKey: \`\${NS}.op.load\`, shortLabelKey: \`\${NS}.opShort.load\` },
  xor: { labelKey: \`\${NS}.op.xor\`, shortLabelKey: \`\${NS}.opShort.xor\` },
};

/** Parses one block of hex; \`lengthErrorKey\` reports a wrong byte length. */
export function readBlockHex(input: unknown, lengthErrorKey: string): HexOfLengthResult {
  return parseHexOfLength(input, [${toConstantCase(id)}_BLOCK_BYTES], { invalidType: \`\${NS}.error.invalidParams\`, wrongLength: lengthErrorKey });
}

/** Validates and normalises params (hex lowercased, separators stripped). */
export function validate${pascal}Params(params: unknown): ValidationResult<${pascal}Params> {
  if (typeof params !== 'object' || params === null) return { ok: false, error: i18nRef(\`\${NS}.error.invalidParams\`) };
  const record = params as Record<string, unknown>;
  const key = readBlockHex(record['keyHex'], \`\${NS}.error.keyLength\`);
  if (!key.ok) return key;
  const input = readBlockHex(record['inputHex'], \`\${NS}.error.inputLength\`);
  if (!input.ok) return input;
  return { ok: true, value: { keyHex: key.hex, inputHex: input.hex } };
}

export const ${camel}Manifest = definePrimitive<${pascal}Params>({
  kind: 'primitive',
  id: '${id}',
  apiVersion: 1,
  family: '${family}',
  implements: [],
  titleKey: \`\${NS}.title\`,
  refs: [],
  facets: ['state', 'values', 'narration'],
  presets: ${toConstantCase(id)}_PRESETS,
  defaults: EXAMPLE,
  i18nNamespace: NS,
  paramFields: ${toConstantCase(id)}_PARAM_FIELDS,
  ops: ${toConstantCase(id)}_OPS,
  outputs: { output: { labelKey: \`\${NS}.value.output\` } },
  validate: validate${pascal}Params,
  load: () => import('./module.ts'),
  // Optional step animations: export \`choreograph(context)\` from ./choreography.ts (see aes/choreography.ts)
  // and uncomment. Without it, views animate steps with the generic fallback choreography.
  // loadChoreography: () => import('./choreography.ts'),
});

export default ${camel}Manifest;
`;
}

function primitiveModuleSource(id: string): string {
  const pascal = toPascalCase(id);
  const constant = toConstantCase(id);
  return `import {
  facetKey,
  i18nRef,
  narrationFromState,
  parseHexOrThrow,
  RecordingTracer,
  valueId,
  xorBytes,
  type RegionSpec,
  type RunOptions,
  type RunResult,
  type TraceBundle,
  type ValueRef,
  type ValueRole,
  type ValuesFacet,
} from '@cryventure/core';
import { ${constant}_BLOCK_BYTES, ${toCamelCase(id)}Manifest, type ${pascal}Params } from './manifest.ts';

/** ${id} producer (scaffolded toy: output = input XOR key). Replace the algorithm, keep the facets. */
type Region = 'state' | 'key';
type Op = { op: 'load' } | { op: 'xor' };

const NS = 'plugin.${id}';
const ALL_BYTES = Array.from({ length: ${constant}_BLOCK_BYTES }, (_, index) => index);
const REGIONS: RegionSpec<Region>[] = [
  { id: 'state', labelKey: \`\${NS}.region.state\`, elem: 'u8', shape: [4, 4], order: 'col-major' },
  { id: 'key', labelKey: \`\${NS}.region.key\`, elem: 'u8', shape: [4, 4], order: 'col-major' },
];

/** Decodes hex that validation has already accepted. */
function validatedBytes(hex: string): number[] {
  return Array.from(parseHexOrThrow(hex));
}

function record(key: number[], input: number[]) {
  const tracer = new RecordingTracer<Region, Op>(REGIONS, { state: new Array<number>(${constant}_BLOCK_BYTES).fill(0), key });
  const output = Array.from(xorBytes(input, key));
  tracer.enter();
  tracer.step({ op: 'load', writes: [{ region: 'state', offset: 0, values: input }], highlights: [{ region: 'state', indices: ALL_BYTES, kind: 'write' }], narration: i18nRef(\`\${NS}.step.load\`) });
  tracer.step({
    op: 'xor',
    writes: [{ region: 'state', offset: 0, values: output }],
    highlights: [{ region: 'key', indices: ALL_BYTES, kind: 'read' }, { region: 'state', indices: ALL_BYTES, kind: 'xor' }],
    narration: i18nRef(\`\${NS}.step.xor\`, { count: ${constant}_BLOCK_BYTES }),
  });
  tracer.leave();
  return { facet: tracer.toFacet(), output };
}

function valueRef(name: string, role: ValueRole, bytes: number[], createdAt: number): ValueRef {
  return { id: valueId([], name), labelKey: \`\${NS}.value.\${name}\`, role, bytes, createdAt };
}

function buildValues(key: number[], input: number[], output: number[], lastStep: number): ValuesFacet {
  const values = [valueRef('key', 'key', key, 0), valueRef('input', 'plaintext', input, 0), valueRef('output', 'ciphertext', output, lastStep)];
  return { kind: 'values', schemaVersion: 1, values };
}

/** Validates \`params\`, runs the traced toy cipher and returns a TraceBundle. */
export function run(params: ${pascal}Params, _options: RunOptions = {}): RunResult {
  const validated = ${toCamelCase(id)}Manifest.validate(params);
  if (!validated.ok) return validated;
  const key = validatedBytes(validated.value.keyHex);
  const input = validatedBytes(validated.value.inputHex);
  const { facet, output } = record(key, input);
  const trace: TraceBundle = {
    schemaVersion: 1,
    producer: { kind: 'primitive', id: '${id}', apiVersion: 1 },
    provenance: 'modeled',
    params: validated.value,
    facets: {
      [facetKey('state')]: facet,
      [facetKey('values')]: buildValues(key, input, output, facet.steps.length - 1),
      [facetKey('narration')]: narrationFromState(facet),
    },
    output: { output },
  };
  return { ok: true, trace };
}
`;
}

function primitiveTestSource(id: string): string {
  const pascal = toPascalCase(id);
  return `import { getFacet, toHex, type NarrationFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { ${toCamelCase(id)}Manifest, readBlockHex, validate${pascal}Params } from './manifest.ts';
import { run } from './module.ts';

const NS = 'plugin.${id}';
const PARAMS = { keyHex: '0f'.repeat(16), inputHex: 'f0'.repeat(16) };

describe('${id} run', () => {
  it('XORs the input block with the key and narrates every step', () => {
    const result = run(PARAMS);
    if (!result.ok) throw new Error('expected ok');
    expect(toHex(result.trace.output['output'] ?? [])).toBe('ff'.repeat(16));
    expect(getFacet<NarrationFacet>(result.trace, 'narration')?.entries).toHaveLength(2);
  });

  it('returns the validation error for bad params', () => {
    expect(run({ ...PARAMS, keyHex: '00' })).toEqual({ ok: false, error: { key: \`\${NS}.error.keyLength\`, params: { length: 1 } } });
  });
});

describe('validate${pascal}Params', () => {
  it('normalises hex', () => {
    expect(validate${pascal}Params({ keyHex: PARAMS.keyHex.toUpperCase(), inputHex: PARAMS.inputHex })).toEqual({ ok: true, value: PARAMS });
  });

  it.each([
    [null, { key: \`\${NS}.error.invalidParams\` }],
    [{ keyHex: PARAMS.keyHex, inputHex: '00' }, { key: \`\${NS}.error.inputLength\`, params: { length: 1 } }],
  ])('rejects %j', (params, error) => {
    expect(validate${pascal}Params(params)).toEqual({ ok: false, error });
  });
});

describe('readBlockHex', () => {
  it('reports hex errors and wrong lengths', () => {
    expect(readBlockHex('zz', 'k')).toEqual({ ok: false, error: { key: 'core.error.hexInvalidChar', params: { char: 'z', index: 0 } } });
    expect(readBlockHex('00', 'k')).toEqual({ ok: false, error: { key: 'k', params: { length: 1 } } });
  });
});

describe('${toCamelCase(id)}Manifest', () => {
  it('lazily loads a module with run()', async () => {
    expect(typeof (await ${toCamelCase(id)}Manifest.load()).run).toBe('function');
  });
});
`;
}

/** Files for `pnpm cv new primitive <id>`. */
export function primitiveTemplate(id: string, family: string): ScaffoldFile[] {
  const folder = primitiveFolder(id);
  const en = primitiveMessages(id);
  return [
    { path: `${folder}/manifest.ts`, content: primitiveManifestSource(id, family) },
    { path: `${folder}/module.ts`, content: primitiveModuleSource(id) },
    { path: `${folder}/module.test.ts`, content: primitiveTestSource(id) },
    { path: `${folder}/i18n/en.json`, content: toJson(en) },
    { path: `${folder}/i18n/de.json`, content: toJson(deStubs(en)) },
    { path: `${folder}/vectors/conformance.json`, content: toJson(primitiveConformance()) },
  ];
}

/** Starter `vectors/conformance.json` for the scaffolded XOR toy (replace with vectors from an independent source). */
export function primitiveConformance(): ConformanceVectors {
  return {
    source: 'TODO: cite the standard or independent implementation these values come from',
    cases: [{ name: 'example', params: { keyHex: '000102030405060708090a0b0c0d0e0f', inputHex: '00112233445566778899aabbccddeeff' }, outputs: { output: '00102030405060708090a0b0c0d0e0f0' } }],
  };
}

// ---------------------------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------------------------

export function viewMessages(id: string): Record<string, string> {
  const ns = `view.${id}`;
  return {
    [`${ns}.title`]: toPascalCase(id),
    [`${ns}.loading`]: 'Preparing the view…',
    [`${ns}.missing`]: 'This lab does not record the data this view needs.',
    [`${ns}.step`]: 'Step {{step}}',
  };
}

function viewManifestSource(id: string, requires: readonly string[]): string {
  return `import { defineView } from '@cryventure/core';
import type { ViewComponent } from '@cryventure/viz';

export default defineView<ViewComponent>({
  kind: 'view',
  id: '${id}',
  apiVersion: 1,
  titleKey: 'view.${id}.title',
  icon: 'grid',
  requires: ${tsStringArray(requires)},
  defaultSlot: 'side',
  order: 100,
  load: () => import('./${toPascalCase(id)}View.tsx'),
});
`;
}

/** The view's own stylesheet, e.g. `bitPlanes.css` (imported by the component, see `views/src/css.d.ts`). */
export function viewStylesheetName(id: string): string {
  return `${toCamelCase(id)}.css`;
}

function viewComponentSource(id: string, requires: readonly string[]): string {
  const name = `${toPascalCase(id)}View`;
  return `import { ViewStatus, useFacet, useLab, useT, type ViewProps } from '@cryventure/viz';
import './${viewStylesheetName(id)}';

const STATUS_KEYS = { loading: 'view.${id}.loading', missing: 'view.${id}.missing' } as const;

/** TODO: describe what the ${id} view shows. Reads the '${requires[0]}' facet at the playhead. */
export default function ${name}(_props: ViewProps) {
  const t = useT();
  const facet = useFacet<unknown>('${requires[0]}');
  const step = useLab((state) => state.step);
  if (facet.status !== 'ready') return <ViewStatus status={facet.status} keys={STATUS_KEYS} />;
  return (
    <section className="cv-view cv-${id}" aria-label={t('view.${id}.title')}>
      <p className="cv-${id}__step">{t('view.${id}.step', { step: step + 1 })}</p>
    </section>
  );
}
`;
}

function viewStylesheetSource(id: string): string {
  return `/*
 * ${toPascalCase(id)} view styles. Imported by the view component, so it ships in the view's lazy chunk.
 * Colours come only from the semantic tokens (--cv-*, --sl-color-*); fallbacks keep it usable standalone.
 */

.cv-${id}__step {
  margin: 0;
  color: var(--cv-text-muted, GrayText);
}
`;
}

function viewTestSource(id: string, requires: readonly string[]): string {
  const name = `${toPascalCase(id)}View`;
  return `import { facetKey, type TraceBundle } from '@cryventure/core';
import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFixtureBundle, renderLab } from '@cryventure/viz/testing';
import { loadViewMessages } from '../messages.ts';
import ${name} from './${name}.tsx';

const REQUIRED = ${tsStringArray(requires)};

/** The shared fixture bundle plus a placeholder for every required facet it lacks. */
function bundleWithRequiredFacets(): TraceBundle {
  const bundle = createFixtureBundle();
  const facets = { ...bundle.facets };
  for (const kind of REQUIRED) facets[facetKey(kind)] ??= { kind, schemaVersion: 1 };
  return { ...bundle, facets };
}

const render = (bundle: TraceBundle) => renderLab(<${name} labId="fixture" lens="story" />, { bundle, messages: loadViewMessages('en') });

describe('${name}', () => {
  it('follows the playhead', () => {
    const { store } = render(bundleWithRequiredFacets());
    act(() => store.getState().seek(1));
    expect(screen.getByText('Step 2')).toBeTruthy();
  });

  it('explains when the required facet is missing', () => {
    render({ ...createFixtureBundle(), facets: {} });
    expect(screen.getByRole('status').textContent).toBe(loadViewMessages('en')['view.${id}.missing']);
  });
});
`;
}

/** Files for `pnpm cv new view <id> --requires <kinds>`. */
export function viewTemplate(id: string, requires: readonly string[]): ScaffoldFile[] {
  const folder = viewFolder(id);
  const name = `${toPascalCase(id)}View`;
  const en = viewMessages(id);
  return [
    { path: `${folder}/manifest.ts`, content: viewManifestSource(id, requires) },
    { path: `${folder}/${name}.tsx`, content: viewComponentSource(id, requires) },
    { path: `${folder}/${viewStylesheetName(id)}`, content: viewStylesheetSource(id) },
    { path: `${folder}/${name}.test.tsx`, content: viewTestSource(id, requires) },
    { path: `${folder}/i18n/en.json`, content: toJson(en) },
    { path: `${folder}/i18n/de.json`, content: toJson(deStubs(en)) },
  ];
}
