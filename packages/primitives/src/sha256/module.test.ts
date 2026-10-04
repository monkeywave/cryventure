import {
  getFacet,
  hashFunction,
  INITIAL_STEP_INDEX,
  parseHexToArray,
  stateAt,
  toHex,
  validateWordopsFacet,
  type AnyStateFacet,
  type TraceBundle,
  type ValuesFacet,
  type WordopsFacet,
} from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { SHA2_OP_NAMES } from '../_lib/sha2/manifestKit.ts';
import { sha256Manifest, SHA256_PRESETS, validateSha256Params, type Sha256Params } from './manifest.ts';
import { ports, run } from './module.ts';
import de from './i18n/de.json';
import en from './i18n/en.json';
import cavp from './vectors/cavp-shortmsg.json';
import intermediate from './vectors/nist-intermediate-abc.json';

const ABC: Sha256Params = { algorithm: 'sha-256', encoding: 'utf8', input: 'abc', detail: 'round' };
const TWO_BLOCK = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';

function trace(params: Sha256Params): TraceBundle {
  const result = run(params);
  if (!result.ok) throw new Error(`run failed: ${result.error.key}`);
  return result.trace;
}
const state = (bundle: TraceBundle) => getFacet<AnyStateFacet>(bundle, 'state')!;
const wordops = (bundle: TraceBundle) => getFacet<WordopsFacet>(bundle, 'wordops')!;
const ops = (bundle: TraceBundle) => state(bundle).steps.map((step) => step.op);
const words = (bytes: readonly number[]) => (toHex(bytes).match(/.{8}/g) ?? []) as string[];

/** The wordops entry of round t in the first block. */
function roundStep(bundle: TraceBundle, t: number) {
  const index = ops(bundle).indexOf('round') + t + Math.max(0, t - 15);
  return wordops(bundle).steps.find((step) => step.step === index)!;
}

describe('sha256 run: NIST intermediate values for "abc" (FIPS 180-4 examples)', () => {
  it.each(['sha-256', 'sha-224'] as const)('%s: a … h after rounds 0, 1, 15, 16, 63 equal the NIST rows', (algorithm) => {
    const bundle = trace({ ...ABC, algorithm });
    const expected = intermediate.algorithms[algorithm].vars as Record<string, string[]>;
    for (const [t, row] of Object.entries(expected)) {
      const step = roundStep(bundle, Number(t));
      expect(step.registers?.after, `t = ${t}`).toEqual(row);
      expect(words(stateAt(state(bundle), step.step)['vars']!), `vars at t = ${t}`).toEqual(row);
    }
  });

  it('W16 and W63 of block 1 equal the transcribed words, in the state and in the wordops terms', () => {
    const bundle = trace(ABC);
    const w = words(stateAt(state(bundle), state(bundle).steps.length - 1)['w']!);
    expect([w[16], w[63]]).toEqual([intermediate.algorithms['sha-256'].w['16'], intermediate.algorithms['sha-256'].w['63']]);
    const schedule63 = wordops(bundle).steps.find((step) => step.formula.params?.['t'] === 63 && step.terms.some((term) => term.id === 'p1'))!;
    expect(schedule63.terms.find((term) => term.id === 'w')?.hex).toBe('12b1edeb');
  });
});

describe('sha256 run: steps, scope and facets', () => {
  it('records pad, init, 16 rounds, then schedule t / round t for t = 16 … 63, feed-forward and output', () => {
    const steps = ops(trace(ABC));
    expect(steps.length).toBe(116);
    expect(steps.slice(0, 3)).toEqual(['pad', 'init', 'round']);
    expect(steps.slice(17, 21)).toEqual(['round', 'schedule', 'round', 'schedule']);
    expect(steps.slice(-2)).toEqual(['feedForward', 'output']);
  });

  it.each([
    ['abc', 'round', 116],
    ['abc', 'block', 5],
    [TWO_BLOCK, 'round', 230],
    [TWO_BLOCK, 'block', 8],
    ['', 'round', 116],
  ] as const)('%j at %s detail has %i steps', (input, detail, count) => {
    expect(state(trace({ ...ABC, input, detail })).steps.length).toBe(count);
  });

  it('scopes steps as block → op, with pad in block 1 and output in the last block', () => {
    const steps = state(trace({ ...ABC, input: TWO_BLOCK })).steps;
    expect(steps[0]!.scope).toEqual([0, 0]);
    expect(steps[115]!.op).toBe('init');
    expect(steps[115]!.scope).toEqual([1, 0]);
    expect(steps[steps.length - 1]!.scope).toEqual([1, 114]);
  });

  it('records only the ops the manifest declares (shared with _lib/sha2)', () => {
    expect(Object.keys(sha256Manifest.ops!)).toEqual([...SHA2_OP_NAMES]);
    const used = new Set([...ops(trace(ABC)), ...ops(trace({ ...ABC, detail: 'block' }))]);
    expect([...used].every((op) => Object.hasOwn(sha256Manifest.ops!, op))).toBe(true);
  });

  it('emits a valid wordops facet with 32-bit words and registers a … h', () => {
    for (const detail of ['round', 'block'] as const) {
      const bundle = trace({ ...ABC, input: TWO_BLOCK, detail });
      expect(validateWordopsFacet(wordops(bundle), state(bundle).steps.length)).toEqual([]);
      expect(wordops(bundle).wordBits).toBe(32);
      expect(wordops(bundle).registerNames).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    }
  });

  it('gives round t the terms of M5 §2d, with K_t + W_t', () => {
    const step = roundStep(trace(ABC), 0);
    expect(step.terms.map((term) => term.id)).toEqual(['Sigma1', 'ch', 'k', 'w', 'kw', 'T1', 'Sigma0', 'maj', 'T2']);
    expect(step.terms.find((term) => term.id === 'kw')?.hex).toBe('a3ec9318');
    expect(step.registers?.before).toEqual(['6a09e667', 'bb67ae85', '3c6ef372', 'a54ff53a', '510e527f', '9b05688c', '1f83d9ab', '5be0cd19']);
  });

  it('gives schedule t σ1, W_{t−7}, σ0, W_{t−16}, p1, p2 and W_t', () => {
    const step = wordops(trace(ABC)).steps.find((entry) => entry.terms.some((term) => term.id === 'p1'))!;
    expect(step.terms.map((term) => term.id)).toEqual(['sigma1', 'w7', 'sigma0', 'w16', 'p1', 'p2', 'w']);
    expect(step.terms.find((term) => term.id === 'w')?.hex).toBe('61626380');
  });

  it('names the algorithm by its FIPS name in the narration', () => {
    const state224 = state(trace({ ...ABC, algorithm: 'sha-224' }));
    expect(state224.initialNarration?.params?.['algorithm']).toBe('SHA-224');
    expect(state224.steps.at(-1)!.narration.key).toBe('plugin.sha256.step.outputTruncated');
    expect(state(trace(ABC)).steps.at(-1)!.narration.key).toBe('plugin.sha256.step.output');
  });

  it('has message, iv, h/<n> and digest values; the chaining values link from the wordops terms', () => {
    const bundle = trace({ ...ABC, input: TWO_BLOCK });
    const values = getFacet<ValuesFacet>(bundle, 'values')!.values;
    expect(values.map((value) => [value.id, value.role])).toEqual([
      ['message', 'public'],
      ['iv', 'constant'],
      ['h/1', 'public'],
      ['h/2', 'public'],
      ['digest', 'public'],
    ]);
    expect(values[0]!.createdAt).toBe(INITIAL_STEP_INDEX);
    const refs = new Set(wordops(bundle).steps.flatMap((step) => step.terms.flatMap((term) => (term.valueRef === undefined ? [] : [term.valueRef]))));
    expect([...refs].sort()).toEqual(['h/1', 'h/2', 'iv']);
  });

  it('omits the message region and value for the empty message', () => {
    const bundle = trace({ ...ABC, input: '' });
    expect(state(bundle).regions.map((region) => region.id)).toEqual(['padded', 'w', 'vars', 'h', 'digest']);
    expect(toHex(bundle.output['digest']!)).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('sha256 validate', () => {
  it('declares the text field limit as the message byte limit validation enforces, in both encodings', () => {
    const field = sha256Manifest.paramFields!.find((entry) => entry.name === 'input')!;
    expect(field.maxLength).toBe(128);
    const max = field.maxLength!;
    expect(validateSha256Params({ ...ABC, input: 'x'.repeat(max) }).ok).toBe(true);
    expect(validateSha256Params({ ...ABC, input: 'x'.repeat(max + 1) }).ok).toBe(false);
    expect(validateSha256Params({ ...ABC, encoding: 'hex', input: '00 '.repeat(max) }).ok).toBe(true);
    expect(validateSha256Params({ ...ABC, encoding: 'hex', input: '00'.repeat(max + 1) }).ok).toBe(false);
  });

  it('accepts every preset and normalises hex', () => {
    for (const preset of SHA256_PRESETS) expect(validateSha256Params(preset.params).ok).toBe(true);
    expect(validateSha256Params({ ...ABC, encoding: 'hex', input: '61 62 63' })).toEqual({ ok: true, value: { ...ABC, encoding: 'hex', input: '616263' } });
    expect(validateSha256Params({ ...ABC, encoding: 'hex', input: '' }).ok).toBe(true);
  });

  it.each([
    [{ ...ABC, encoding: 'hex', input: '616' }, 'core.error.hexOddLength'],
    [{ ...ABC, input: 'x'.repeat(129) }, 'plugin.sha256.error.inputLength'],
    [{ ...ABC, encoding: 'hex', input: '00'.repeat(129) }, 'plugin.sha256.error.inputLength'],
    [{ ...ABC, algorithm: 'sha-512' }, 'plugin.sha256.error.algorithm'],
    [{ ...ABC, encoding: 'base64' }, 'plugin.sha256.error.encoding'],
    [{ ...ABC, detail: 'bit' }, 'plugin.sha256.error.detail'],
    [{ ...ABC, input: 42 }, 'plugin.sha256.error.invalidParams'],
  ])('rejects %j with %s', (params, key) => {
    const result = validateSha256Params(params);
    expect(result.ok ? undefined : result.error.key).toBe(key);
  });

  it('counts UTF-8 bytes, not characters', () => {
    expect(validateSha256Params({ ...ABC, input: 'ä'.repeat(64) }).ok).toBe(true);
    expect(validateSha256Params({ ...ABC, input: 'ä'.repeat(65) }).ok).toBe(false);
  });
});

describe('sha256 against NIST CAVP SHAVS ShortMsg (every case)', () => {
  const cases = cavp.cases.filter((testCase) => testCase.algorithm === 'sha-224' || testCase.algorithm === 'sha-256');

  it('holds the recorded number of cases per file', () => {
    for (const [algorithm, { cases: count }] of Object.entries(cavp.files)) expect(cases.filter((testCase) => testCase.algorithm === algorithm).length).toBe(count);
  });

  it.each(cases.map((testCase) => [testCase.algorithm, testCase.bytes, testCase]))('%s, %i bytes: run() and ports.Hash', (_algorithm, _bytes, testCase) => {
    const algorithm = testCase.algorithm as Sha256Params['algorithm'];
    const bundle = trace({ algorithm, encoding: 'hex', input: testCase.msg, detail: 'block' });
    expect(toHex(bundle.output['digest']!)).toBe(testCase.md);
    expect(toHex(hashFunction(ports.Hash, algorithm)!.hash(Uint8Array.from(parseHexToArray(testCase.msg))))).toBe(testCase.md);
  });
});

describe('sha256 run: stale schedule words from block 2 on', () => {
  it('leaves W16 … W63 of block 1 in place at the init of block 2 (round detail)', () => {
    const bundle = trace({ ...ABC, input: TWO_BLOCK });
    const steps = state(bundle).steps;
    const init2 = steps.findLastIndex((step) => step.op === 'init');
    expect(steps[init2]!.narration.key).toBe('plugin.sha256.step.init');
    const block1W = words(stateAt(state(bundle), init2 - 1)['w']!);
    const atInit2 = words(stateAt(state(bundle), init2)['w']!);
    expect(atInit2.slice(16)).toEqual(block1W.slice(16));
    expect(atInit2.slice(0, 16)).not.toEqual(block1W.slice(0, 16));
  });

  it('says so in the init narration of block n ≥ 2, in EN and DE', () => {
    expect(en['plugin.sha256.step.init']).toContain('W₁₆ … W₆₃ still hold the words of block {{prev}}');
    expect(de['plugin.sha256.step.init']).toContain('enthalten W₁₆ … W₆₃ noch die Wörter von Block {{prev}}');
  });
});

describe('sha256 catalogs', () => {
  it('pluralises the DE zero-byte count', () => {
    for (const key of ['plugin.sha256.step.pad_one', 'plugin.sha256.step.pad_other'] as const) expect(de[key]).toContain('{{zeros}} Nullbytes und');
  });

  it('words the DE op labels as actions, like EN', () => {
    expect([en['plugin.sha256.op.round'], en['plugin.sha256.op.compress']]).toEqual(['Run one compression round', 'Run all rounds of the block']);
    expect(de['plugin.sha256.op.round']).toBe('Eine Runde der Kompressionsfunktion ausführen');
    expect(de['plugin.sha256.op.compress']).toBe('Alle Runden des Blocks ausführen');
  });
});

describe('sha256 CAVP vector file', () => {
  it('describes its copy accurately: every ShortMsg case (all at most 64 bytes), 65 per file', () => {
    expect(Object.values(cavp.files).map((file) => file.cases)).toEqual(Object.values(cavp.files).map(() => 65));
    expect(Math.max(...cavp.cases.map((testCase) => testCase.bytes))).toBe(64);
    expect(cavp.filter).toContain('all 65 cases of each file');
    expect(cavp.filter).toContain('at most 64 bytes');
  });
});
