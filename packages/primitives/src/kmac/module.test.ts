import { getFacet, parseHexOrThrow, toHex, utf8Bytes, validateSpongeFacet, type AnyStateFacet, type NarrationFacet, type SpongeFacet, type TraceBundle, type ValuesFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { cloneProblems, macMember, splitUpdateProblems } from '../_lib/hmac/macPortTestKit.ts';
import { KMAC_VARIANTS, kmacOutput } from '../_lib/keccak/kmac.ts';
import { SHA3_DETAILS, type KmacParams } from '../_lib/keccak/manifestKit.ts';
import { kmacManifest, KMAC_PORT_MEMBERS, KMAC_PRESETS } from './manifest.ts';
import { ports, run } from './module.ts';
import conformance from './vectors/conformance.json';

const SAMPLE1 = KMAC_PRESETS[0]!.params;

function trace(params: KmacParams): TraceBundle {
  const result = run(params);
  if (!result.ok) throw new Error(`run failed: ${result.error.key}`);
  return result.trace;
}
const state = (bundle: TraceBundle) => getFacet<AnyStateFacet>(bundle, 'state')!;
const sponge = (bundle: TraceBundle) => getFacet<SpongeFacet>(bundle, 'sponge')!;
const ops = (bundle: TraceBundle) => state(bundle).steps.map((step) => step.op);
const tag = (bundle: TraceBundle) => toHex(bundle.output['tag'] ?? []);
const narrationKey = (bundle: TraceBundle, op: string) => state(bundle).steps.find((step) => step.op === op)!.narration.key;

const cases = conformance.cases.map((testCase) => [testCase.name, testCase] as const);
type ConformanceCase = (typeof conformance.cases)[number];
const inputsOf = ({ params }: ConformanceCase) => ({ key: parseHexOrThrow(params.key), data: parseHexOrThrow(params.input), customization: utf8Bytes(params.customization), outputLength: Number(params.outputLength) });

describe(`kmac: SP 800-185 KMAC and KMACXOF samples (${conformance.count} cases)`, () => {
  it('lists all twelve samples, six KMAC and six KMACXOF', () => {
    expect(conformance.cases.length).toBe(conformance.count);
    expect(conformance.cases.filter((testCase) => testCase.params.algorithm.startsWith('kmacxof')).length).toBe(6);
  });

  it.each(cases)('%s through run() at every detail', (_name, testCase) => {
    for (const detail of SHA3_DETAILS) expect(tag(trace({ ...(testCase.params as KmacParams), detail }))).toBe(testCase.outputs.tag);
  });

  it.each(cases)('%s through the untraced lib', (_name, testCase) => {
    const { key, data, customization, outputLength } = inputsOf(testCase);
    expect(toHex(kmacOutput(KMAC_VARIANTS[testCase.params.algorithm as KmacParams['algorithm']], key, data, outputLength, customization))).toBe(testCase.outputs.tag);
  });

  const macCases = cases.filter(([, testCase]) => !testCase.params.algorithm.startsWith('kmacxof'));
  it.each(macCases)('%s through ports.Mac: one-shot, split updates and clones', (_name, testCase) => {
    const fn = macMember(ports.Mac, testCase.params.algorithm);
    const { key, data, customization, outputLength } = inputsOf(testCase);
    expect(toHex(fn.mac(key, data, { customization, outputLength }))).toBe(testCase.outputs.tag);
    const context = fn.create(key, { customization, outputLength });
    for (const byte of data) context.update(Uint8Array.of(byte));
    expect(toHex(context.mac())).toBe(testCase.outputs.tag);
    const copy = context.clone();
    copy.update(Uint8Array.of(0));
    expect(toHex(context.mac())).toBe(testCase.outputs.tag);
    expect(splitUpdateProblems(fn, key, data)).toEqual([]);
    expect(cloneProblems(fn, key, data)).toEqual([]);
  });
});

describe('kmac run: steps, scopes and facets', () => {
  it('records encodeKey, encodeLength, pad, then absorb + Keccak-f per block, squeeze and output at permutation detail', () => {
    // Sample #1: prefix 168 + encoded key 168 + X 4 + right_encode(256) 3 = 343 bytes → 3 blocks of 168.
    expect(ops(trace(SAMPLE1))).toEqual(['encodeKey', 'encodeLength', 'pad', 'absorb', 'permute', 'absorb', 'permute', 'absorb', 'permute', 'squeeze', 'output']);
  });

  it('puts the encodings in block 0 like pad: directly in the block at mapping detail, in their own op scope otherwise', () => {
    expect(state(trace(SAMPLE1)).steps.slice(0, 3).map((step) => step.scope)).toEqual([[0, 0], [0, 1], [0, 2]]);
    expect(state(trace({ ...SAMPLE1, detail: 'mapping' })).steps.slice(0, 3).map((step) => step.scope)).toEqual([[0], [0], [0]]);
  });

  it('writes the encoded key (one rate block for a 32-byte key) and right_encode(L)', () => {
    const steps = state(trace(SAMPLE1)).steps;
    const encodedKey = steps[0]!.writes[0]!;
    expect([encodedKey.region, encodedKey.values.length, toHex(encodedKey.values.slice(0, 5))]).toEqual(['encodedKey', 168, '01a8020100']);
    expect([steps[1]!.writes[0]!.region, toHex(steps[1]!.writes[0]!.values)]).toEqual(['encodedLength', '010002']);
    expect(toHex(state(trace({ ...SAMPLE1, algorithm: 'kmacxof128' })).steps[1]!.writes[0]!.values)).toBe('0001');
  });

  it('narrates N = "KMAC" and S in pad (padNoS for an empty S), the length or its absence, and starts with the teaching-tool note', () => {
    const tagged = trace(KMAC_PRESETS[1]!.params);
    expect(narrationKey(tagged, 'pad')).toBe('plugin.kmac.step.pad');
    const pad = state(tagged).steps.find((step) => step.op === 'pad')!.narration.params;
    expect(pad).toMatchObject({ functionName: 'KMAC', customization: 'My Tagged Application', prefixBytes: 168, newXBytes: 175, bytes: 4 });
    expect(narrationKey(trace(SAMPLE1), 'pad')).toBe('plugin.kmac.step.padNoS');
    expect(narrationKey(trace({ ...SAMPLE1, algorithm: 'kmacxof128' }), 'encodeLength')).toBe('plugin.kmac.step.encodeLengthXof');
    const narration = getFacet<NarrationFacet>(trace(SAMPLE1), 'narration')!;
    expect(narration.entries[0]!).toMatchObject({ step: -1, ref: { key: 'plugin.kmac.step.initial', params: { algorithm: 'KMAC128', cshake: 'cSHAKE128', keyBytes: 32, bytes: 4, outputBytes: 32 } } });
  });

  it('has a valid sponge facet over the state steps, without sponge steps for the two encodings', () => {
    const bundle = trace(KMAC_PRESETS[2]!.params);
    const facet = sponge(bundle);
    expect(validateSpongeFacet(facet, state(bundle).steps.length)).toEqual([]);
    expect(facet.steps.length).toBe(state(bundle).steps.length - 2);
    expect(facet.steps[0]!.phase).toBe('pad');
    expect(facet.rateLanes).toBe(21);
    expect(sponge(trace(KMAC_PRESETS[3]!.params)).rateLanes).toBe(17);
  });

  it('squeezes twice when L exceeds the rate (KMAC256, 168 bytes: 136 + 32)', () => {
    const bundle = trace({ ...KMAC_PRESETS[3]!.params, outputLength: '168' });
    expect(sponge(bundle).steps.filter((step) => step.phase === 'squeeze').map((step) => step.output!.length / 2)).toEqual([136, 32]);
    const { key, data } = { key: parseHexOrThrow(SAMPLE1.key), data: parseHexOrThrow(SAMPLE1.input) };
    expect(tag(bundle)).toBe(toHex(ports.Mac.functions[1]!.mac(key, data, { customization: utf8Bytes('My Tagged Application'), outputLength: 168 })));
  });

  it('publishes K (role key), X, S, the encoded key (secret) and the tag', () => {
    const values = getFacet<ValuesFacet>(trace(KMAC_PRESETS[1]!.params), 'values')!.values;
    expect(values.map((value) => [value.labelKey, value.role])).toEqual([
      ['plugin.kmac.value.key', 'key'],
      ['plugin.kmac.value.message', 'public'],
      ['plugin.kmac.value.s', 'public'],
      ['plugin.kmac.value.encodedKey', 'secret'],
      ['plugin.kmac.value.tag', 'tag'],
    ]);
  });

  it('runs with an empty key, an empty message and UTF-8 input', () => {
    const bundle = trace({ ...SAMPLE1, key: '', encoding: 'utf8', input: '' });
    expect(tag(bundle)).toBe(toHex(ports.Mac.functions[0]!.mac(new Uint8Array(0), new Uint8Array(0))));
    expect(state(bundle).regions.map((region) => region.id)).toEqual(['encodedKey', 'encodedLength', 'padded', 'A', 'output']);
    expect(tag(trace({ ...SAMPLE1, encoding: 'utf8', input: 'abc' }))).toBe(toHex(ports.Mac.functions[0]!.mac(parseHexOrThrow(SAMPLE1.key), utf8Bytes('abc'))));
  });
});

describe('kmac manifest and port', () => {
  it('has the presets of docs/M7.md §2c, kmac128-sample1 first and as the default', () => {
    expect(KMAC_PRESETS.map((preset) => preset.id)).toEqual(['kmac128-sample1', 'kmac128-sample2', 'kmac128-sample3', 'kmac256-sample4', 'kmac256-sample5', 'kmac256-sample6', 'kmacxof128-sample1', 'kmacxof256-sample4']);
    expect(kmacManifest.defaults).toEqual(SAMPLE1);
    expect(SAMPLE1).toMatchObject({ key: '404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f', input: '00010203', detail: 'permutation' });
  });

  it('runs every preset to its SP 800-185 sample tag', () => {
    const expected = new Map(conformance.cases.map((testCase) => [JSON.stringify(testCase.params), testCase.outputs.tag]));
    for (const preset of KMAC_PRESETS) expect(tag(trace(preset.params)), preset.id).toBe(expected.get(JSON.stringify(preset.params)));
  });

  it('rejects invalid params with an error, not a throw', () => {
    const result = run({ ...SAMPLE1, key: 'zz' });
    expect(result.ok).toBe(false);
  });

  it('declares the Mac members kmac128 and kmac256 in port order, construction kmac', () => {
    expect(kmacManifest.implements).toEqual(['Mac']);
    expect(KMAC_PORT_MEMBERS).toEqual([
      { id: 'kmac128', labelKey: 'plugin.kmac.mac.kmac128', construction: 'kmac' },
      { id: 'kmac256', labelKey: 'plugin.kmac.mac.kmac256', construction: 'kmac' },
    ]);
    expect(ports.Mac.id).toBe('kmac');
    expect(ports.Mac.functions.map((fn) => [fn.id, fn.construction.kind])).toEqual(KMAC_PORT_MEMBERS.map((member) => [member.id, member.construction]));
  });
});
