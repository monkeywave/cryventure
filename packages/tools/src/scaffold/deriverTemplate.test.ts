import { describe, expect, it } from 'vitest';
import { deriverFolder, deriverMessages, deriverTemplate } from './deriverTemplate.ts';
import { deStubs } from './templates.ts';

const contentOf = (files: { path: string; content: string }[], suffix: string) => files.find((file) => file.path.endsWith(suffix))?.content ?? '';

describe('deriverFolder', () => {
  it('places derivers in their package', () => expect(deriverFolder('demo-trace')).toBe('packages/derivers/src/demo-trace'));
});

describe('deriverTemplate', () => {
  const files = deriverTemplate('demo-trace', ['state', 'values'], 'demo-steps');

  it('creates manifest, module, test and EN/DE catalogs', () => {
    expect(files.map((file) => file.path)).toEqual(['manifest.ts', 'module.ts', 'module.test.ts', 'i18n/en.json', 'i18n/de.json'].map((name) => `packages/derivers/src/demo-trace/${name}`));
  });

  it('wires id, from and provides into the manifest; plugin sources import core only', () => {
    const manifest = contentOf(files, 'manifest.ts');
    expect(manifest).toContain("id: 'demo-trace'");
    expect(manifest).toContain("from: ['state', 'values']");
    expect(manifest).toContain("provides: ['demo-steps']");
    expect(manifest).toContain('export const demoTraceManifest = defineDeriver({');
    expect(manifest).toContain("load: () => import('./module.ts')");
    for (const source of [manifest, contentOf(files, '/module.ts')]) expect([...source.matchAll(/from '([^']+)'/g)].map((match) => match[1])).toEqual(['@cryventure/core']);
  });

  it('derives the provided kind with steps aligned to the state steps', () => {
    const module = contentOf(files, '/module.ts');
    expect(module).toContain("return { [facetKey('demo-steps')]: facet };");
    expect(module).toContain('align: { first: index, last: index }');
  });

  it('keeps every message key under deriver.<id> with [DE] stubs, and uses only defined keys', () => {
    const en = JSON.parse(contentOf(files, 'en.json')) as Record<string, string>;
    expect(en).toEqual(deriverMessages('demo-trace'));
    expect(Object.keys(en).every((key) => key.startsWith('deriver.demo-trace.'))).toBe(true);
    expect(JSON.parse(contentOf(files, 'de.json'))).toEqual(deStubs(en));
    const used = [...contentOf(files, '/module.ts').matchAll(/\$\{NS\}\.([a-z][\w.-]*\w)/g)].map((match) => `deriver.demo-trace.${match[1]}`);
    expect(used.sort()).toEqual(Object.keys(en).sort());
  });
});
