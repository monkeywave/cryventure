import {
  getFacet,
  hashFunction,
  INITIAL_STEP_INDEX,
  parseHexToArray,
  stateAt,
  toHex,
  validateWordopsFacet,
  type AnyStateFacet,
  type NarrationFacet,
  type TraceBundle,
  type ValuesFacet,
  type WordopsFacet,
} from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { SHA512_224_IV, SHA512_256_IV } from '../_lib/sha2/constants.ts';
import { SHA2_OP_NAMES } from '../_lib/sha2/steps.ts';
import { WORD64, wordsHex } from '../_lib/sha2/words.ts';
import { sha512Manifest, SHA512_OP_NAMES, SHA512_PRESETS, validateSha512Params, type Sha512Params } from './manifest.ts';
import { ports, run } from './module.ts';
import de from './i18n/de.json';
import en from './i18n/en.json';
import cavp from './vectors/cavp-shortmsg.json';
import intermediate from './vectors/nist-intermediate-abc.json';

const ABC: Sha512Params = { algorithm: 'sha-512', encoding: 'utf8', input: 'abc', detail: 'round' };
const TWO_BLOCK = 'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu';
const IV_256: Sha512Params = { ...ABC, algorithm: 'sha-512/t-iv', input: 'SHA-512/256' };

function trace(params: Sha512Params): TraceBundle {
  const result = run(params);
  if (!result.ok) throw new Error(`run failed: ${result.error.key}`);
  return result.trace;
}
const state = (bundle: TraceBundle) => getFacet<AnyStateFacet>(bundle, 'state')!;
const wordops = (bundle: TraceBundle) => getFacet<WordopsFacet>(bundle, 'wordops')!;
const ops = (bundle: TraceBundle) => state(bundle).steps.map((step) => step.op);
const words = (bytes: readonly number[]) => (toHex(bytes).match(/.{16}/g) ?? []) as string[];

/** The wordops entry of round t in the first block. */
function roundStep(bundle: TraceBundle, t: number) {
  const index = ops(bundle).indexOf('round') + t + Math.max(0, t - 15);
  return wordops(bundle).steps.find((step) => step.step === index)!;
}

describe('sha512 run: NIST intermediate values for "abc" (FIPS 180-4 examples)', () => {
  it.each(['sha-512', 'sha-384', 'sha-512/224', 'sha-512/256'] as const)('%s: a … h after rounds 0, 1, 15, 16, 79 equal the NIST rows', (algorithm) => {
    const bundle = trace({ ...ABC, algorithm });
    const expected = intermediate.algorithms[algorithm].vars as Record<string, string[]>;
    expect(Object.keys(expected)).toEqual(['0', '1', '15', '16', '79']);
    for (const [t, row] of Object.entries(expected)) {
      const step = roundStep(bundle, Number(t));
      expect(step.registers?.after, `t = ${t}`).toEqual(row);
      expect(words(stateAt(state(bundle), step.step)['vars']!), `vars at t = ${t}`).toEqual(row);
    }
  });
});

describe('sha512 run: steps, scope and facets', () => {
  it('records pad, init, 16 rounds, then schedule t / round t for t = 16 … 79, feed-forward and output', () => {
    const steps = ops(trace(ABC));
    expect(steps.length).toBe(148);
    expect(steps.slice(0, 3)).toEqual(['pad', 'init', 'round']);
    expect(steps.slice(17, 21)).toEqual(['round', 'schedule', 'round', 'schedule']);
    expect(steps.slice(-2)).toEqual(['feedForward', 'output']);
  });

  it.each([
    ['abc', 'round', 148],
    ['abc', 'block', 5],
    [TWO_BLOCK, 'round', 294],
    [TWO_BLOCK, 'block', 8],
    ['', 'round', 148],
    ['x'.repeat(128), 'round', 294],
  ] as const)('%j at %s detail has %i steps', (input, detail, count) => {
    expect(state(trace({ ...ABC, input, detail })).steps.length).toBe(count);
  });

  it('scopes steps as block → op, with pad in block 1 and output in the last block', () => {
    const steps = state(trace({ ...ABC, input: TWO_BLOCK })).steps;
    expect(steps[0]!.scope).toEqual([0, 0]);
    expect(steps[147]!.op).toBe('init');
    expect(steps[147]!.scope).toEqual([1, 0]);
    expect(steps[steps.length - 1]!.scope).toEqual([1, 146]);
  });

  it('records only the ops the manifest declares (shared with _lib/sha2)', () => {
    expect(SHA512_OP_NAMES).toEqual(SHA2_OP_NAMES);
    const used = new Set([...ops(trace(ABC)), ...ops(trace({ ...ABC, detail: 'block' }))]);
    expect([...used].every((op) => Object.hasOwn(sha512Manifest.ops!, op))).toBe(true);
  });

  it('emits a valid wordops facet with 64-bit words and registers a … h', () => {
    for (const params of [{ ...ABC, input: TWO_BLOCK }, { ...ABC, input: TWO_BLOCK, detail: 'block' as const }, IV_256]) {
      const bundle = trace(params);
      expect(validateWordopsFacet(wordops(bundle), state(bundle).steps.length)).toEqual([]);
      expect(wordops(bundle).wordBits).toBe(64);
      expect(wordops(bundle).registerNames).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    }
  });

  it('gives round 0 the terms of M5 §2d with 64-bit K_0 + W_0', () => {
    const step = roundStep(trace(ABC), 0);
    expect(step.terms.map((term) => term.id)).toEqual(['Sigma1', 'ch', 'k', 'w', 'kw', 'T1', 'Sigma0', 'maj', 'T2']);
    expect(step.terms.find((term) => term.id === 'k')?.hex).toBe('428a2f98d728ae22');
    expect(step.terms.find((term) => term.id === 'kw')?.hex).toBe('a3ec9318d728ae22');
    expect(step.registers?.before).toEqual(['6a09e667f3bcc908', 'bb67ae8584caa73b', '3c6ef372fe94f82b', 'a54ff53a5f1d36f1', '510e527fade682d1', '9b05688c2b3e6c1f', '1f83d9abfb41bd6b', '5be0cd19137e2179']);
  });

  it('names the algorithm by its FIPS name in the narration', () => {
    const state384 = state(trace({ ...ABC, algorithm: 'sha-384' }));
    expect(state384.initialNarration?.params?.['algorithm']).toBe('SHA-384');
    expect(state384.steps.at(-1)!.narration.key).toBe('plugin.sha512.step.outputTruncated');
    expect(state(trace({ ...ABC, algorithm: 'sha-512/256' })).steps.at(-1)!.narration.params?.['bits']).toBe(256);
    expect(state(trace(ABC)).steps.at(-1)!.narration.key).toBe('plugin.sha512.step.output');
  });

  it('has message, iv, h/<n> and digest values', () => {
    const values = getFacet<ValuesFacet>(trace({ ...ABC, input: TWO_BLOCK }), 'values')!.values;
    expect(values.map((value) => [value.id, value.role])).toEqual([
      ['message', 'public'],
      ['iv', 'constant'],
      ['h/1', 'public'],
      ['h/2', 'public'],
      ['digest', 'public'],
    ]);
    expect(values[0]!.createdAt).toBe(INITIAL_STEP_INDEX);
  });

  it('hashes the empty message to the NIST digest', () => {
    expect(toHex(trace({ ...ABC, input: '' }).output['digest']!)).toBe(cavp.cases.find((testCase) => testCase.algorithm === 'sha-512' && testCase.bytes === 0)!.md);
  });
});

describe('sha512 run: the SHA-512/t IV generation function (FIPS 180-4 §5.3.6)', () => {
  it.each([
    ['SHA-512/256', SHA512_256_IV],
    ['SHA-512/224', SHA512_224_IV],
  ] as const)('hashing %j yields that function’s initial hash value', (input, iv) => {
    expect(toHex(trace({ ...IV_256, input }).output['digest']!)).toBe(wordsHex(WORD64, iv, ''));
  });

  it('starts from H(0)″ = H(0) ⊕ a5a5… and explains it at the init step', () => {
    const bundle = trace(IV_256);
    const init = state(bundle).steps[1]!;
    expect(init.op).toBe('init');
    expect(init.narration.key).toBe('plugin.sha512.step.initFirstIvGeneration');
    expect(init.narration.params).toMatchObject({ mask: 'a5a5a5a5a5a5a5a5', h: 'cfac43c256196cad 1ec20b20216f029e 99cb56d75b315d8e 00ea509ffab89354 f4abf7da08432774 3ea0cd298e9bc9ba ba267c0e5ee418ce fe4568bcb6db84dc' });
    expect(String(init.narration.params?.['base'])).toMatch(/^6a09e667f3bcc908 /);
    expect(state(bundle).initialNarration?.key).toBe('plugin.sha512.step.initialIvGeneration');
    expect(state(bundle).steps.at(-1)!.narration.key).toBe('plugin.sha512.step.outputIvGeneration');
  });

  it('keeps the narration facet in step with the state facet', () => {
    const bundle = trace(IV_256);
    const entries = getFacet<NarrationFacet>(bundle, 'narration')!.entries;
    expect(entries[0]!.ref.key).toBe('plugin.sha512.step.initialIvGeneration');
    expect(entries.find((entry) => entry.step === 1)!.ref.key).toBe('plugin.sha512.step.initFirstIvGeneration');
    expect(entries.filter((entry) => entry.ref.key.endsWith('IvGeneration'))).toHaveLength(3);
  });

  it('narrates the other algorithms without the IV generation keys', () => {
    const keys = getFacet<NarrationFacet>(trace(ABC), 'narration')!.entries.map((entry) => entry.ref.key);
    expect(keys.some((key) => key.endsWith('IvGeneration'))).toBe(false);
  });
});

describe('sha512 ports.Hash', () => {
  it('offers the four standard functions and not the IV generator (not a standard hash)', () => {
    expect(ports.Hash.id).toBe('sha512');
    expect(ports.Hash.functions.map((fn) => [fn.id, fn.blockSize, fn.outputSize])).toEqual([
      ['sha-384', 128, 48],
      ['sha-512', 128, 64],
      ['sha-512/224', 128, 28],
      ['sha-512/256', 128, 32],
    ]);
    expect(hashFunction(ports.Hash, 'sha-512/t-iv')).toBeUndefined();
  });
});

describe('sha512 validate', () => {
  it('accepts every preset and normalises hex', () => {
    for (const preset of SHA512_PRESETS) expect(validateSha512Params(preset.params).ok).toBe(true);
    expect(validateSha512Params({ ...ABC, encoding: 'hex', input: '61 62 63' })).toEqual({ ok: true, value: { ...ABC, encoding: 'hex', input: '616263' } });
    expect(validateSha512Params({ ...ABC, encoding: 'hex', input: '' }).ok).toBe(true);
  });

  it.each([
    [{ ...ABC, encoding: 'hex', input: '616' }, 'core.error.hexOddLength'],
    [{ ...ABC, input: 'x'.repeat(129) }, 'plugin.sha512.error.inputLength'],
    [{ ...ABC, encoding: 'hex', input: '00'.repeat(129) }, 'plugin.sha512.error.inputLength'],
    [{ ...ABC, algorithm: 'sha-256' }, 'plugin.sha512.error.algorithm'],
    [{ ...ABC, encoding: 'base64' }, 'plugin.sha512.error.encoding'],
    [{ ...ABC, detail: 'bit' }, 'plugin.sha512.error.detail'],
    [{ ...ABC, input: 42 }, 'plugin.sha512.error.invalidParams'],
  ])('rejects %j with %s', (params, key) => {
    const result = validateSha512Params(params);
    expect(result.ok ? undefined : result.error.key).toBe(key);
  });
});

describe('sha512 against NIST CAVP SHAVS ShortMsg (every case)', () => {
  it('holds the recorded number of cases per file', () => {
    for (const [algorithm, { cases: count }] of Object.entries(cavp.files)) expect(cavp.cases.filter((testCase) => testCase.algorithm === algorithm).length).toBe(count);
  });

  it.each(cavp.cases.map((testCase) => [testCase.algorithm, testCase.bytes, testCase]))('%s, %i bytes: run() and ports.Hash', (_algorithm, _bytes, testCase) => {
    const algorithm = testCase.algorithm as Sha512Params['algorithm'];
    const bundle = trace({ algorithm, encoding: 'hex', input: testCase.msg, detail: 'block' });
    expect(toHex(bundle.output['digest']!)).toBe(testCase.md);
    expect(toHex(hashFunction(ports.Hash, algorithm)!.hash(Uint8Array.from(parseHexToArray(testCase.msg))))).toBe(testCase.md);
  });
});

describe('sha512 run: stale schedule words from block 2 on', () => {
  it('leaves W16 … W79 of block 1 in place at the init of block 2 (round detail)', () => {
    const bundle = trace({ ...ABC, input: TWO_BLOCK });
    const steps = state(bundle).steps;
    const init2 = steps.findLastIndex((step) => step.op === 'init');
    expect(steps[init2]!.narration.key).toBe('plugin.sha512.step.init');
    const block1W = words(stateAt(state(bundle), init2 - 1)['w']!);
    const atInit2 = words(stateAt(state(bundle), init2)['w']!);
    expect(atInit2.slice(16)).toEqual(block1W.slice(16));
    expect(atInit2.slice(0, 16)).not.toEqual(block1W.slice(0, 16));
  });

  it('says so in the init narration of block n ≥ 2, in EN and DE', () => {
    expect(en['plugin.sha512.step.init']).toContain('W₁₆ … W₇₉ still hold the words of block {{prev}}');
    expect(de['plugin.sha512.step.init']).toContain('enthalten W₁₆ … W₇₉ noch die Wörter von Block {{prev}}');
  });
});

describe('sha512 catalogs', () => {
  it('pluralises the DE zero-byte count', () => {
    for (const key of ['plugin.sha512.step.pad_one', 'plugin.sha512.step.pad_other'] as const) expect(de[key]).toContain('{{zeros}} Nullbytes und');
  });

  it('words the DE op labels as actions, like EN', () => {
    expect([en['plugin.sha512.op.round'], en['plugin.sha512.op.compress']]).toEqual(['Run one compression round', 'Run all rounds of the block']);
    expect(de['plugin.sha512.op.round']).toBe('Eine Runde der Kompressionsfunktion ausführen');
    expect(de['plugin.sha512.op.compress']).toBe('Alle Runden des Blocks ausführen');
  });
});

describe('sha512 CAVP vector file', () => {
  it('describes its copy accurately: every ShortMsg case (all at most 128 bytes), 129 per file', () => {
    expect(Object.values(cavp.files).map((file) => file.cases)).toEqual(Object.values(cavp.files).map(() => 129));
    expect(Math.max(...cavp.cases.map((testCase) => testCase.bytes))).toBe(128);
    expect(cavp.filter).toContain('all 129 cases of each file');
    expect(cavp.filter).toContain('at most 128 bytes');
  });
});
