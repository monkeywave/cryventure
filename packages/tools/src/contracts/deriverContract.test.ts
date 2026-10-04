import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { facetKey, getFacet, type AnyStateFacet, type DeriverManifest, type MemoryFacet, type RegistersFacet, type TraceBundle, type ValuesFacet } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LocaleCatalogs } from './catalogs.ts';
import { deriverContract, deriverReport, DERIVER_CHECKS, deriveApplicableCases, recordGoldenFixtures, type DeriverReport } from './deriverContract.ts';
import { stateStepCount } from './deriverChecks.ts';
import { cachedPrimitiveBundleCases } from './deriverCases.ts';
import { goldenJson } from './deriverGolden.ts';
import { producerRegistry, type ProducerSet } from './runWithPorts.ts';

/** Synthetic derivers over the real aes and xor producers (aes applies, xor does not). */
const list = primitiveManifests.filter((manifest) => manifest.id === 'aes' || manifest.id === 'xor');
const producers: ProducerSet = { list, lookup: producerRegistry(list) };

const LABEL = 'deriver.demo.label';
const STEP = 'deriver.demo.step';
const catalogs: LocaleCatalogs = {
  en: { [LABEL]: 'Demo registers', [STEP]: 'After step {{step}}' },
  de: { [LABEL]: 'Demo-Register', [STEP]: 'Nach Schritt {{step}}' },
};

/** A valid registers facet: one 128-bit register written at every state step, linked to the first value. */
function demoRegisters(bundle: TraceBundle): RegistersFacet & { note: unknown } {
  const steps = getFacet<AnyStateFacet>(bundle, 'state')?.steps ?? [];
  const valueRef = getFacet<ValuesFacet>(bundle, 'values')?.values[0]?.id;
  return {
    kind: 'registers',
    schemaVersion: 1,
    label: { key: LABEL },
    note: { key: STEP, params: { step: steps.length } },
    file: { isa: 'demo', byteOrder: 'little', registers: [{ name: 'r0', bits: 128, lanes: [8, 32] }] },
    steps: steps.map((_, index) => ({ align: { first: index, last: index }, writes: [{ reg: 'r0', bytes: Array.from({ length: 16 }, () => index % 256), valueRef }] })),
  };
}

/** A valid memory facet with one 16-byte allocation made at `allocatedAt` and one write at `writeStep`. */
function demoMemory(allocatedAt: number, writeStep: number): MemoryFacet {
  return {
    kind: 'memory',
    schemaVersion: 1,
    label: { key: LABEL },
    provenance: 'modeled',
    target: { triple: 'x86_64-linux-gnu', dataModel: 'LP64', ptrSize: 8, endian: 'little' },
    allocations: [{ id: 'buf', space: 'stack', addr: '0x1000', size: 16, align: 16, label: { key: LABEL }, allocatedAt }],
    writes: [{ align: { first: writeStep, last: writeStep }, addr: '0x1000', bytes: [1] }],
  };
}

type Derive = (bundle: TraceBundle) => Partial<Record<string, unknown>>;

function deriver(derive: Derive, overrides: Partial<DeriverManifest> = {}): DeriverManifest {
  return {
    kind: 'deriver',
    id: 'demo',
    apiVersion: 1,
    from: ['state', 'values'],
    provides: ['registers'],
    appliesTo: (bundle) => bundle.producer.id === 'aes',
    load: async () => ({ derive }),
    ...overrides,
  };
}

const valid = deriver((bundle) => ({ [facetKey('registers', 'demo')]: demoRegisters(bundle) }));

/** `valid`, with the registers facet changed by `edit`. */
const editedRegisters = (edit: (facet: ReturnType<typeof demoRegisters>) => unknown) => deriver((bundle) => ({ [facetKey('registers', 'demo')]: edit(demoRegisters(bundle)) }));

/** Temp folders created by `freshGoldenDir`, removed after the file. */
const tempDirs: string[] = [];
afterAll(() => tempDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function freshGoldenDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cv-golden-'));
  tempDirs.push(dir);
  return join(dir, 'fixtures');
}

/** The report in update mode on an empty fixtures folder, so the golden check records its first fixture. */
const report = (manifest: DeriverManifest, extra: { catalogs?: LocaleCatalogs; goldenDir?: string; updateGolden?: boolean } = {}) =>
  deriverReport(manifest, { producers, catalogs, goldenDir: freshGoldenDir(), updateGolden: true, ...extra });

/** The checks of a report that found problems. */
const failing = (result: DeriverReport) => DERIVER_CHECKS.map(([check]) => check).filter((check) => result[check].length > 0);

describe('deriverReport', () => {
  it('passes a valid deriver on every check', async () => {
    expect(failing(await report(valid))).toEqual([]);
  });

  it.each([
    ['wrong kind', deriver((bundle) => ({ 'memory@demo': demoRegisters(bundle) })), ['kinds', 'schema']],
    ['key without variant', deriver((bundle) => ({ registers: demoRegisters(bundle) })), ['kinds']],
    ['span past the last state step', editedRegisters((facet) => ({ ...facet, steps: facet.steps.map((step) => ({ ...step, align: { first: 0, last: 9999 } })) })), ['align']],
    ['unknown valueRef', editedRegisters((facet) => ({ ...facet, steps: facet.steps.map((step) => ({ ...step, writes: step.writes.map((write) => ({ ...write, valueRef: 'nope' })) })) })), ['valueRefs']],
    ['ref outside deriver.<id>.*', editedRegisters((facet) => ({ ...facet, label: { key: 'view.state.title' } })), ['i18n']],
    ['invalid registers schema', editedRegisters((facet) => ({ ...facet, file: { ...facet.file, registers: [{ name: 'r0', bits: 64, lanes: [8] }] } })), ['schema']],
    ['malformed facet (validator throws)', editedRegisters(() => ({ kind: 'registers' })), ['schema']],
    ['non-JSON value', editedRegisters((facet) => ({ ...facet, raw: new Uint8Array(2) })), ['serializable']],
    ['throwing derive', deriver(() => { throw new Error('boom'); }), ['derives', 'golden']],
    ['failing load', { ...valid, load: () => Promise.reject(new Error('nope')) }, ['derives', 'golden']],
    ['input mutation', deriver((bundle) => { bundle.params = { mutated: true }; return { [facetKey('registers', 'demo')]: demoRegisters(bundle) }; }), ['derives']],
    ['empty provides', { ...valid, provides: [] }, ['manifest', 'kinds']],
    ['bad id', { ...valid, id: 'Demo' }, ['manifest', 'i18n', 'namespace']],
    ['no applicable preset', { ...valid, appliesTo: () => false }, ['applicable', 'golden']],
    ['malformed ref in a known field', editedRegisters((facet) => ({ ...facet, label: { key: LABEL, extra: 1 } })), ['i18n']],
    ['memory write outside its allocation lifetime', deriver(
      (bundle) => ({ [facetKey('memory', 'demo')]: demoMemory(stateStepCount(bundle) - 1, 0) }),
      { provides: ['memory'] },
    ), ['schema']],
  ] as const)('flags %s', async (_name, manifest, checks) => {
    expect(failing(await report(manifest as DeriverManifest))).toEqual(checks);
  });

  it('flags nondeterminism', async () => {
    let calls = 0;
    const flaky = editedRegisters((facet) => ({ ...facet, label: { key: LABEL }, calls: calls++ }));
    expect(failing(await report(flaky))).toEqual(['deterministic']);
  });

  it('flags a key missing in DE, and catalog keys outside the namespace', async () => {
    const missingDe = { en: catalogs.en, de: { [LABEL]: 'Demo-Register', 'plugin.x.y': 'z' } };
    const result = await report(valid, { catalogs: missingDe });
    expect(failing(result)).toEqual(['i18n', 'namespace']);
    expect(result.i18n.every((problem) => problem.includes(`de:${STEP} missing`))).toBe(true);
    expect(result.namespace).toEqual(['de:plugin.x.y']);
  });
});

describe('deriverReport golden fixtures', () => {
  it('flags a deriver without any golden fixture (docs/M4.md §7)', async () => {
    const dir = freshGoldenDir();
    expect((await report(valid, { goldenDir: dir, updateGolden: false })).golden).toEqual([`${dir}: no golden fixture (*.golden.json); pnpm golden:update records one`]);
  });

  it('records the first golden for aes/fips197-c1 in update mode, which then matches', async () => {
    const dir = freshGoldenDir();
    expect((await report(valid, { goldenDir: dir, updateGolden: true })).golden).toEqual([]);
    expect(readdirSync(dir)).toEqual(['aes-fips197-c1.golden.json']);
    const stored = JSON.parse(readFileSync(join(dir, 'aes-fips197-c1.golden.json'), 'utf8')) as { producerId: string; presetId: string; facets: Record<string, unknown> };
    expect([stored.producerId, stored.presetId, Object.keys(stored.facets)]).toEqual(['aes', 'fips197-c1', ['registers@demo']]);
    expect((await report(valid, { goldenDir: dir, updateGolden: false })).golden).toEqual([]);
  });

  it('records the first applicable case when aes/fips197-c1 does not apply', async () => {
    const dir = freshGoldenDir();
    const xorOnly = deriver(() => ({ [facetKey('registers', 'demo')]: { kind: 'registers' } }), { appliesTo: (bundle) => bundle.producer.id === 'xor', from: ['state'] });
    expect((await report(xorOnly, { goldenDir: dir, updateGolden: true })).golden).toEqual([]);
    expect(readdirSync(dir)).toEqual(['xor-defaults.golden.json']);
  });

  it('reports when update mode has no derivable case to record', async () => {
    const dir = freshGoldenDir();
    expect((await report({ ...valid, appliesTo: () => false }, { goldenDir: dir, updateGolden: true })).golden).toEqual([`${dir}: no golden fixture, and no applicable, derivable case to record one from`]);
    expect(existsSync(dir)).toBe(false);
  });
});

describe('deriverReport golden fixture files', () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'cv-golden-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const write = (name: string, value: unknown) => writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));

  it('updates, then matches, then flags a drifted fixture', async () => {
    write('c1.golden.json', { producerId: 'aes', presetId: 'fips197-c1' });
    expect((await report(valid, { goldenDir: dir, updateGolden: true })).golden).toEqual([]);
    const stored = JSON.parse(readFileSync(join(dir, 'c1.golden.json'), 'utf8')) as { facets: Record<string, unknown> };
    expect(Object.keys(stored.facets)).toEqual(['registers@demo']);
    expect((await report(valid, { goldenDir: dir, updateGolden: false })).golden).toEqual([]);
    write('c1.golden.json', goldenJson({ producerId: 'aes', presetId: 'fips197-c1', facets: { 'registers@demo': {} } }));
    expect((await report(valid, { goldenDir: dir, updateGolden: false })).golden).toEqual([expect.stringContaining('registers@demo differ from the golden fixture')]);
  });

  it('flags malformed fixtures and fixtures naming no applicable case', async () => {
    rmSync(join(dir, 'c1.golden.json'));
    write('bad.golden.json', '{');
    write('other.golden.json', { producerId: 'xor', presetId: 'defaults', facets: {} });
    write('shape.golden.json', { producerId: 1 });
    write('ignored.json', '{');
    const problems = (await report(valid, { goldenDir: dir, updateGolden: false })).golden;
    expect(problems).toEqual([expect.stringContaining('invalid JSON'), expect.stringContaining('no applicable, derivable case xor/defaults'), expect.stringContaining('needs string producerId and presetId')]);
  });
});

describe('deriveApplicableCases', () => {
  it('derives only the cases the deriver applies to', async () => {
    const cases = await cachedPrimitiveBundleCases(producers);
    const derived = await deriveApplicableCases(valid, cases);
    expect(derived.map(({ testCase }) => testCase.producerId)).toEqual(cases.filter(({ producerId }) => producerId === 'aes').map(({ producerId }) => producerId));
    expect(derived.every(({ facets }) => facets !== undefined)).toBe(true);
  });

  it('exercises a deriver on every preset of a producer that newly joins the set (e.g. a new hash for a listing deriver)', async () => {
    const xor = primitiveManifests.find((manifest) => manifest.id === 'xor')!;
    const renamed = (bundle: TraceBundle): TraceBundle => ({ ...bundle, producer: { ...bundle.producer, id: 'fresh' } });
    const fresh = {
      ...xor,
      id: 'fresh',
      load: async () => {
        const module = await xor.load();
        return { ...module, run: (params: unknown) => { const result = module.run(params as never); return result.ok ? { ...result, trace: renamed(result.trace) } : result; } };
      },
    } as typeof xor;
    const withFresh = [...list, fresh];
    const onFresh = deriver((bundle) => ({ [facetKey('registers', 'demo')]: demoRegisters(bundle) }), { appliesTo: (bundle) => bundle.producer.id === 'fresh' });
    const derived = await deriveApplicableCases(onFresh, await cachedPrimitiveBundleCases({ list: withFresh, lookup: producerRegistry(withFresh) }));
    expect(derived.map(({ testCase }) => testCase.name)).toEqual(['fresh/defaults', ...xor.presets.map((preset) => `fresh/${preset.id}`)]);
    expect(derived.every(({ facets }) => facets !== undefined)).toBe(true);
  });
});

/** The registered suite itself, on the valid deriver (its golden recorded first, as `pnpm golden:update` would). */
const suiteGoldenDir = freshGoldenDir();
await recordGoldenFixtures(valid, { producers, catalogs, goldenDir: suiteGoldenDir });
deriverContract(valid, { producers, catalogs, goldenDir: suiteGoldenDir, updateGolden: false });
