import { toCamelCase, toPascalCase } from './naming.ts';
import { deStubs, toJson, tsStringArray, type ScaffoldFile } from './templates.ts';

/**
 * Files for `pnpm cv new deriver <id> --from state --provides <kind>`: a demo deriver that derives
 * one step per state step (aligned to it) and passes `deriverContract` as generated.
 */

export function deriverFolder(id: string): string {
  return `packages/derivers/src/${id}`;
}

export function deriverMessages(id: string): Record<string, string> {
  const ns = `deriver.${id}`;
  return {
    [`${ns}.label`]: `${toPascalCase(id)} (demo deriver – replace me)`,
    [`${ns}.step`]: 'Covers state step {{step}}',
  };
}

function deriverManifestSource(id: string, from: readonly string[], provides: string): string {
  const camel = toCamelCase(id);
  return `import { defineDeriver, getFacet, type AnyStateFacet, type TraceBundle } from '@cryventure/core';

/** True for bundles whose state facet has at least one step. */
export function hasStateSteps(bundle: TraceBundle): boolean {
  return (getFacet<AnyStateFacet>(bundle, 'state')?.steps.length ?? 0) > 0;
}

/**
 * ${id} deriver (scaffolded demo). Reads only the facets listed in \`from\` (a producer's published
 * facet contract, never its code) and returns every \`provides\` kind, deterministically.
 */
export const ${camel}Manifest = defineDeriver({
  kind: 'deriver',
  id: '${id}',
  apiVersion: 1,
  from: ${tsStringArray(from)},
  provides: ['${provides}'],
  // Decide on the real bundle, e.g. \`bundle.producer.id === 'aes'\` plus a check of the state facet's ops.
  appliesTo: hasStateSteps,
  load: () => import('./module.ts'),
});

export default ${camel}Manifest;
`;
}

function deriverModuleSource(id: string, provides: string): string {
  const pascal = toPascalCase(id);
  return `import { facetKey, getFacet, type AlignSpan, type AnyStateFacet, type FacetKey, type I18nRef, type TraceBundle } from '@cryventure/core';

const NS = 'deriver.${id}';

/** One derived step: the inclusive range of state steps it covers, and a note. */
export interface ${pascal}Step {
  align: AlignSpan;
  note: I18nRef;
}

/** TODO: replace with the facet this deriver provides (JSON only; labels as I18nRef under deriver.${id}.*). */
export interface ${pascal}Facet {
  kind: '${provides}';
  schemaVersion: 1;
  label: I18nRef;
  steps: ${pascal}Step[];
}

/** Derives one step per state step. Must be deterministic and must not modify \`bundle\`. */
export function derive(bundle: TraceBundle): Partial<Record<FacetKey, unknown>> {
  const state = getFacet<AnyStateFacet>(bundle, 'state');
  if (state === undefined) throw new Error('${id}: the bundle has no state facet');
  const facet: ${pascal}Facet = {
    kind: '${provides}',
    schemaVersion: 1,
    label: { key: \`\${NS}.label\` },
    steps: state.steps.map((_, index) => ({ align: { first: index, last: index }, note: { key: \`\${NS}.step\`, params: { step: index + 1 } } })),
  };
  return { [facetKey('${provides}')]: facet };
}
`;
}

function deriverTestSource(id: string, provides: string): string {
  const pascal = toPascalCase(id);
  const camel = toCamelCase(id);
  return `import { facetKey, type TraceBundle } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { ${camel}Manifest, hasStateSteps } from './manifest.ts';
import { derive, type ${pascal}Facet } from './module.ts';

/** A minimal bundle whose state facet has \`steps\` steps (\`undefined\`: no state facet). */
function bundle(steps?: number): TraceBundle {
  const facets = steps === undefined ? {} : { [facetKey('state')]: { kind: 'state', steps: Array.from({ length: steps }, () => ({})) } };
  return { schemaVersion: 1, producer: { kind: 'primitive', id: 'demo', apiVersion: 1 }, provenance: 'modeled', params: {}, facets, output: {} };
}

describe('${id} derive', () => {
  it('derives one step per state step, aligned to it', () => {
    const facet = derive(bundle(2))[facetKey('${provides}')] as ${pascal}Facet;
    expect(facet.steps.map((step) => step.align)).toEqual([{ first: 0, last: 0 }, { first: 1, last: 1 }]);
    expect(facet.steps[1]?.note).toEqual({ key: 'deriver.${id}.step', params: { step: 2 } });
  });

  it('is deterministic', () => expect(derive(bundle(3))).toEqual(derive(bundle(3))));

  it('throws without a state facet', () => expect(() => derive(bundle())).toThrow('${id}: the bundle has no state facet'));
});

describe('${camel}Manifest', () => {
  it('applies to bundles with state steps only', () => {
    expect(hasStateSteps(bundle(1))).toBe(true);
    expect(hasStateSteps(bundle(0))).toBe(false);
    expect(hasStateSteps(bundle())).toBe(false);
  });

  it('lazily loads a module with derive()', async () => {
    expect(typeof (await ${camel}Manifest.load()).derive).toBe('function');
  });
});
`;
}

/** Files for `pnpm cv new deriver <id> --from <kinds> --provides <kind>`. */
export function deriverTemplate(id: string, from: readonly string[], provides: string): ScaffoldFile[] {
  const folder = deriverFolder(id);
  const en = deriverMessages(id);
  return [
    { path: `${folder}/manifest.ts`, content: deriverManifestSource(id, from, provides) },
    { path: `${folder}/module.ts`, content: deriverModuleSource(id, provides) },
    { path: `${folder}/module.test.ts`, content: deriverTestSource(id, provides) },
    { path: `${folder}/i18n/en.json`, content: toJson(en) },
    { path: `${folder}/i18n/de.json`, content: toJson(deStubs(en)) },
  ];
}
