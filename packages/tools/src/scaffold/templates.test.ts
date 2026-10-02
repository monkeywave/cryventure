import { describe, expect, it } from 'vitest';
import { deStubs, tsStringArray, primitiveFolder, primitiveMessages, primitiveTemplate, toJson, viewFolder, viewMessages, viewTemplate } from './templates.ts';

const contentOf = (files: { path: string; content: string }[], suffix: string) => files.find((file) => file.path.endsWith(suffix))?.content ?? '';

describe('toJson / deStubs', () => {
  it('pretty-prints with a trailing newline and prefixes DE stubs', () => {
    expect(toJson({ a: 'b' })).toBe('{\n  "a": "b"\n}\n');
    expect(deStubs({ k: 'Round {{n}}' })).toEqual({ k: '[DE] Round {{n}}' });
  });
});

describe('tsStringArray', () => {
  it('renders a single-quoted array literal', () => {
    expect(tsStringArray(['state', 'values'])).toBe("['state', 'values']");
  });
});

describe('folders', () => {
  it('places plugins in their package', () => {
    expect(primitiveFolder('demo-xor')).toBe('packages/primitives/src/demo-xor');
    expect(viewFolder('demo-bits')).toBe('packages/views/src/demo-bits');
  });
});

describe('primitiveTemplate', () => {
  const files = primitiveTemplate('demo-xor', 'block-cipher');

  it('creates manifest, module, test and EN/DE catalogs', () => {
    expect(files.map((file) => file.path)).toEqual(['manifest.ts', 'module.ts', 'module.test.ts', 'i18n/en.json', 'i18n/de.json'].map((name) => `packages/primitives/src/demo-xor/${name}`));
  });

  it('wires id, family and names into the manifest; manifest imports core only', () => {
    const manifest = contentOf(files, 'manifest.ts');
    expect(manifest).toContain("id: 'demo-xor'");
    expect(manifest).toContain("family: 'block-cipher'");
    expect(manifest).toContain('export const demoXorManifest = definePrimitive<DemoXorParams>');
    expect(manifest).toContain('paramFields: DEMO_XOR_PARAM_FIELDS');
    expect(manifest).toContain("// loadChoreography: () => import('./choreography.ts'),");
    expect([...manifest.matchAll(/from '([^']+)'/g)].map((match) => match[1])).toEqual(['@cryventure/core']);
  });

  it('declares op and output labels and validates hex with the core helpers', () => {
    const manifest = contentOf(files, 'manifest.ts');
    expect(manifest).toContain('ops: DEMO_XOR_OPS');
    expect(manifest).toContain('outputs: { output: { labelKey: `${NS}.value.output` } }');
    expect(manifest).toContain('parseHexOfLength(input, [DEMO_XOR_BLOCK_BYTES]');
    expect(contentOf(files, 'module.ts')).toContain('parseHexOrThrow(hex)');
    expect(primitiveMessages('demo-xor')).toMatchObject({ 'plugin.demo-xor.op.load': expect.any(String), 'plugin.demo-xor.opShort.xor': 'XOR' });
  });

  it('keeps every message key under plugin.<id> with [DE] stubs', () => {
    const en = JSON.parse(contentOf(files, 'en.json')) as Record<string, string>;
    expect(en).toEqual(primitiveMessages('demo-xor'));
    expect(Object.keys(en).every((key) => key.startsWith('plugin.demo-xor.'))).toBe(true);
    expect(JSON.parse(contentOf(files, 'de.json'))).toEqual(deStubs(en));
  });

  it('only references message suffixes that the catalog defines', () => {
    const sources = files.filter((file) => file.path.endsWith('.ts')).map((file) => file.content).join('\n');
    const used = [...sources.matchAll(/\$\{NS\}\.([a-z][\w.-]*[\w])/g)].map((match) => `plugin.demo-xor.${match[1]}`);
    const isValuePrefix = (key: string) => key === 'plugin.demo-xor.value';
    expect(used.length).toBeGreaterThan(5);
    expect(used.filter((key) => !isValuePrefix(key) && !(key in primitiveMessages('demo-xor')))).toEqual([]);
  });
});

describe('viewTemplate', () => {
  const files = viewTemplate('demo-bits', ['values', 'state']);

  it('creates manifest, component, stylesheet, test and EN/DE catalogs', () => {
    expect(files.map((file) => file.path)).toEqual(['manifest.ts', 'DemoBitsView.tsx', 'demoBits.css', 'DemoBitsView.test.tsx', 'i18n/en.json', 'i18n/de.json'].map((name) => `packages/views/src/demo-bits/${name}`));
  });

  it('declares the required facets and lazily loads the component', () => {
    const manifest = contentOf(files, 'manifest.ts');
    expect(manifest).toContain("requires: ['values', 'state']");
    expect(manifest).toContain("load: () => import('./DemoBitsView.tsx')");
    expect(contentOf(files, 'DemoBitsView.tsx')).toContain("useFacet<unknown>('values')");
  });

  it('imports its own stylesheet and shows loading/missing through ViewStatus', () => {
    const component = contentOf(files, 'DemoBitsView.tsx');
    expect(component).toContain("import './demoBits.css';");
    expect(component).toContain('<ViewStatus status={facet.status} keys={STATUS_KEYS} />');
    expect(contentOf(files, 'demoBits.css')).toContain('.cv-demo-bits__step');
  });

  it('keeps every message key under view.<id> with [DE] stubs', () => {
    const en = JSON.parse(contentOf(files, 'en.json')) as Record<string, string>;
    expect(en).toEqual(viewMessages('demo-bits'));
    expect(Object.keys(en).every((key) => key.startsWith('view.demo-bits.'))).toBe(true);
    expect(JSON.parse(contentOf(files, 'de.json'))).toEqual(deStubs(en));
  });
});
