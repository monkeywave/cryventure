import { getFacet, toHex, validateWordopsFacet, type AnyStateFacet, type NarrationFacet, type TraceBundle, type ValuesFacet, type WordopsFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { CONSTANT_SPECS } from './constantSpecs.ts';
import { mismatchedWords, recordConstants, wordValueId } from './constantsTrace.ts';
import { FIPS_TABLES } from './fipsTables.ts';
import { SHA2_CONSTANT_IDS, SHA2_CONSTANTS_PRESETS, validateSha2ConstantsParams, type Sha2ConstantId } from './manifest.ts';
import { run } from './module.ts';
import vectors from './vectors/conformance.json';

const NS = 'plugin.sha2-constants';

function traceOf(constant: Sha2ConstantId): TraceBundle {
  const result = run({ constant });
  if (!result.ok) throw new Error(`expected ok: ${JSON.stringify(result.error)}`);
  return result.trace;
}

const stateOf = (trace: TraceBundle): AnyStateFacet => getFacet<AnyStateFacet>(trace, 'state')!;
const wordopsOf = (trace: TraceBundle): WordopsFacet => getFacet<WordopsFacet>(trace, 'wordops')!;

describe('sha2-constants derivation', () => {
  it.each(SHA2_CONSTANT_IDS)('%s: every derived word equals the FIPS 180-4 row', (id) => {
    const recording = recordConstants(id, CONSTANT_SPECS[id], FIPS_TABLES[id]);
    expect(recording.hexWords).toEqual(FIPS_TABLES[id]);
    expect(recording.mismatches).toEqual([]);
  });

  it('SHA-224 IV words are the low halves of the SHA-384 IV words', () => {
    expect(FIPS_TABLES['sha224-iv']).toEqual(FIPS_TABLES['sha384-iv'].map((word) => word.slice(8)));
  });

  it('narrates a mismatch when the reference table differs', () => {
    const wrong = FIPS_TABLES['sha256-iv'].map((word, index) => (index === 3 ? '00000000' : word));
    const recording = recordConstants('sha256-iv', CONSTANT_SPECS['sha256-iv'], wrong);
    expect(recording.mismatches).toEqual([3]);
    expect(recording.state.steps.at(-1)?.narration).toEqual({ key: `${NS}.step.compareMismatch`, params: { count: 8, section: '§5.3.3', mismatches: 1 } });
  });

  it('reports mismatching rows by index',() => expect(mismatchedWords(['aa', 'bb', 'cc'], ['aa', 'bx', 'cc', 'dd'])).toEqual([1, 3]));
});

describe('sha2-constants run', () => {
  it.each(vectors.cases)('reproduces "$name" for $params.constant', ({ params, outputs }) => {
    expect(toHex(traceOf(params.constant as Sha2ConstantId).output['constants'] ?? [])).toBe(outputs.constants);
  });

  it.each([
    ['sha256-k', 65],
    ['sha512-k', 81],
    ['sha256-iv', 9],
    ['sha512-iv', 9],
    ['sha384-iv', 9],
    ['sha224-iv', 9],
  ] as const)('%s records one step per word plus the comparison (%i steps)', (id, count) => {
    const steps = stateOf(traceOf(id)).steps;
    expect(steps).toHaveLength(count);
    expect(steps.at(-1)?.op).toBe('compare');
    expect(steps.slice(0, -1).every((step) => step.op === 'word')).toBe(true);
  });

  it('narrates the initial state, every word and the matching comparison', () => {
    const entries = getFacet<NarrationFacet>(traceOf('sha256-iv'), 'narration')?.entries ?? [];
    expect(entries).toHaveLength(1 + 9);
    expect(entries[0]).toEqual({ step: -1, ref: { key: `${NS}.step.initial.sha256-iv`, params: { section: '§5.3.3' } } });
    expect(entries[1]?.ref).toEqual({ key: `${NS}.step.wordSquare`, params: { n: 1, p: 2, integer: '1', word: '6a09e667', bits: 32, symbol: 'H', index: 0 } });
    expect(entries.at(-1)?.ref.key).toBe(`${NS}.step.compareMatch`);
  });

  it('narrates the skipped bits of SHA-224', () => {
    const entries = getFacet<NarrationFacet>(traceOf('sha224-iv'), 'narration')?.entries ?? [];
    expect(entries[1]?.ref).toEqual({ key: `${NS}.step.wordSquareSkip`, params: { n: 9, p: 23, integer: '4', skipped: 'cbbb9d5d', word: 'c1059ed8', bits: 32, symbol: 'H', index: 0 } });
  });

  it('lays the table out as big-endian words of 4 or 8 bytes', () => {
    expect(stateOf(traceOf('sha256-k')).regions[0]?.layout).toEqual({ kind: 'words', wordBytes: 4, labelPrefix: 'K', wordsPerGroup: 8 });
    expect(stateOf(traceOf('sha512-iv')).regions[0]?.layout).toEqual({ kind: 'words', wordBytes: 8, labelPrefix: 'H', wordsPerGroup: 8 });
    expect(stateOf(traceOf('sha256-k')).steps[0]?.writes).toEqual([{ region: 'constants', offset: 0, values: [0x42, 0x8a, 0x2f, 0x98] }]);
  });
});

describe('sha2-constants wordops facet', () => {
  it.each(SHA2_CONSTANT_IDS)('%s passes validateWordopsFacet with one step per word', (id) => {
    const trace = traceOf(id);
    const wordops = wordopsOf(trace);
    expect(validateWordopsFacet(wordops, stateOf(trace).steps.length)).toEqual([]);
    expect(wordops.wordBits).toBe(CONSTANT_SPECS[id].bits);
    expect(wordops.steps.map((step) => step.step)).toEqual(Array.from({ length: CONSTANT_SPECS[id].count }, (_, index) => index));
  });

  it('shows p, the integer part and the fraction word (SHA-512 K0)', () => {
    const [first] = wordopsOf(traceOf('sha512-k')).steps;
    expect(first?.formula).toEqual({ key: `${NS}.math.wordCube`, params: { symbol: 'K', index: 0, p: 2, bits: 64 } });
    expect(first?.terms.map(({ id, hex, role }) => ({ id, hex, role }))).toEqual([
      { id: 'p', hex: '0000000000000002', role: 'operand' },
      { id: 'integer', hex: '0000000000000001', role: 'intermediate' },
      { id: 'word', hex: '428a2f98d728ae22', role: 'result' },
    ]);
  });

  it('adds the skipped half for SHA-224', () => {
    const [first] = wordopsOf(traceOf('sha224-iv')).steps;
    expect(first?.terms.map((term) => term.id)).toEqual(['p', 'integer', 'skipped', 'word']);
    expect(first?.terms[2]?.hex).toBe('cbbb9d5d');
  });

  it('links each word term to a value in the values facet', () => {
    const trace = traceOf('sha384-iv');
    const ids = new Set((getFacet<ValuesFacet>(trace, 'values')?.values ?? []).map((value) => value.id));
    const refs = wordopsOf(trace).steps.map((step) => step.terms.find((term) => term.id === 'word')?.valueRef);
    expect(refs).toEqual(Array.from({ length: 8 }, (_, index) => wordValueId(index)));
    expect(refs.every((ref) => ref !== undefined && ids.has(ref))).toBe(true);
  });
});

describe('validateSha2ConstantsParams', () => {
  it('accepts every preset and defaults to SHA-256 K', () => {
    SHA2_CONSTANTS_PRESETS.forEach((preset) => expect(validateSha2ConstantsParams(preset.params)).toEqual({ ok: true, value: preset.params }));
    expect(validateSha2ConstantsParams({})).toEqual({ ok: true, value: { constant: 'sha256-k' } });
  });

  it('rejects unknown tables and non-objects', () => {
    expect(validateSha2ConstantsParams({ constant: 'md5-k' })).toEqual({ ok: false, error: { key: `${NS}.error.constant`, params: { constant: 'md5-k' } } });
    expect(validateSha2ConstantsParams(null)).toEqual({ ok: false, error: { key: `${NS}.error.invalidParams` } });
  });
});
