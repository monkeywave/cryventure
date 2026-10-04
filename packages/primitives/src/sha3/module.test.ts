import { getFacet, hashFunction, parseHexToArray, stateAt, toHex, utf8Bytes, validateSpongeFacet, xofFunction, type AnyStateFacet, type SpongeFacet, type SpongeStep, type TraceBundle, type ValuesFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { cloneProblems, hmacMemberFor, namedVectors, patternBytes, splitUpdateProblems, vectorTagHex } from '../_lib/hmac/macPortTestKit.ts';
import { KECCAK_ALGORITHMS } from '../_lib/keccak/algorithms.ts';
import { keccakOutput } from '../_lib/keccak/hash.ts';
import { SHA3_DETAILS, type KeccakAlgorithmId } from '../_lib/keccak/manifestKit.ts';
import { sha3Manifest, SHA3_PRESETS, type Sha3Params } from './manifest.ts';
import { ports, run } from './module.ts';
import cavp from './vectors/sha3-cavp-shortmsg.json';
import cshakeSamples from './vectors/cshake-samples.json';
import nist from './vectors/sha3-nist-examples.json';
import wycheproof from '../_lib/hmac/vectors/wycheproof-subset.json';

const ABC: Sha3Params = { algorithm: 'sha3-256', encoding: 'utf8', input: 'abc', outputLength: '32', functionName: '', customization: '', detail: 'mapping' };

function trace(params: Sha3Params): TraceBundle {
  const result = run(params);
  if (!result.ok) throw new Error(`run failed: ${result.error.key}`);
  return result.trace;
}
const state = (bundle: TraceBundle) => getFacet<AnyStateFacet>(bundle, 'state')!;
const sponge = (bundle: TraceBundle) => getFacet<SpongeFacet>(bundle, 'sponge')!;
const ops = (bundle: TraceBundle) => state(bundle).steps.map((step) => step.op);
const digest = (bundle: TraceBundle) => toHex(bundle.output['digest'] ?? []);
const family = ports.Hash;

/** A 200-byte FIPS 202 state string as its 25 lanes in the sponge facet's hex format. */
function lanesOf(stateHex: string): string[] {
  const bytes = parseHexToArray(stateHex);
  return Array.from({ length: 25 }, (_, lane) => toHex(bytes.slice(lane * 8, lane * 8 + 8).reverse()));
}

describe('sha3 run: NIST SHA3-256 Msg0 intermediate values (FIPS 202 examples)', () => {
  const bundle = trace({ ...ABC, input: '' });
  const steps = sponge(bundle).steps;
  const find = (phase: SpongeStep['phase'], round?: number) => steps.find((step) => step.phase === phase && step.round === round)!;
  const expected = nist.intermediate.states;

  it.each([
    ['absorb', undefined, 'absorbed'],
    ['theta', 0, 'round0AfterTheta'],
    ['rho', 0, 'round0AfterRho'],
    ['pi', 0, 'round0AfterPi'],
    ['chi', 0, 'round0AfterChi'],
    ['iota', 0, 'round0AfterIota'],
    ['iota', 23, 'round23AfterIota'],
  ] as const)('the lanes after %s (round %s) equal %s, in the sponge facet and in region A', (phase, round, name) => {
    const step = find(phase, round);
    expect(step.lanes).toEqual(lanesOf(expected[name]));
    expect(toHex(stateAt(state(bundle), step.step)['A']!)).toBe(expected[name]);
  });

  it('θ of round 0 carries C, D and partial; ι carries RC[0] = 1', () => {
    const theta = find('theta', 0).theta!;
    expect(theta.c.slice(0, 2)).toEqual(['0000000000000006', '8000000000000000']);
    expect(theta.d).toEqual(['0000000000000001', '0000000000000006', '8000000000000000', '0000000000000000', '000000000000000c']);
    expect(theta.partial).toEqual(['0000000000000006', '0000000000000000', '0000000000000000', '0000000000000000', '0000000000000000']);
    expect(find('iota', 0).iota).toEqual({ rc: '0000000000000001' });
  });

  it('round 23 at round detail and the permutation at permutation detail reach the same state', () => {
    expect(sponge(trace({ ...ABC, input: '', detail: 'round' })).steps.find((step) => step.phase === 'round' && step.round === 23)!.lanes).toEqual(lanesOf(expected.afterPermutation));
    expect(sponge(trace({ ...ABC, input: '', detail: 'permutation' })).steps.find((step) => step.phase === 'permute')!.lanes).toEqual(lanesOf(expected.afterPermutation));
  });
});

type CavpCase = (typeof cavp.cases)[number] & { md?: string; output?: string; outputBytes?: number };

describe(`sha3: CAVP byte-oriented SHA-3 vectors (${cavp.cases.length} cases ≤ 200 bytes) through the lib and the port`, () => {
  const cases = cavp.cases as CavpCase[];
  it.each(['sha3-224', 'sha3-256', 'sha3-384', 'sha3-512'] as const)('%s ShortMsg', (id) => {
    const port = hashFunction(family, id)!;
    const algorithm = KECCAK_ALGORITHMS[id];
    for (const testCase of cases.filter((c) => c.algorithm === id)) {
      const message = Uint8Array.from(parseHexToArray(testCase.msg));
      expect(toHex(keccakOutput(algorithm, message, algorithm.outputSize!)), `lib ${testCase.bytes} bytes`).toBe(testCase.md);
      expect(toHex(port.hash(message)), `port ${testCase.bytes} bytes`).toBe(testCase.md);
    }
  });

  it.each(['shake128', 'shake256'] as const)('%s ShortMsg and VariableOut through xof()', (id) => {
    const port = xofFunction(family, id)!;
    const xofCases = cases.filter((c) => c.algorithm === id);
    expect(xofCases.length).toBeGreaterThan(1000);
    for (const testCase of xofCases) {
      const message = Uint8Array.from(parseHexToArray(testCase.msg));
      expect(toHex(keccakOutput(KECCAK_ALGORITHMS[id], message, testCase.outputBytes!)), `lib ${testCase.bytes}/${testCase.outputBytes}`).toBe(testCase.output);
      expect(toHex(port.xof(message, testCase.outputBytes!)), `port ${testCase.bytes}/${testCase.outputBytes}`).toBe(testCase.output);
    }
  });
});

describe('sha3: NIST examples and SP 800-185 samples through the port', () => {
  it.each(nist.cases as { name: string; algorithm: string; msg: string; md?: string; outputBytes?: number; output?: string }[])('$name', (testCase) => {
    const message = Uint8Array.from(parseHexToArray(testCase.msg));
    const { outputBytes } = testCase;
    const output = outputBytes === undefined ? hashFunction(family, testCase.algorithm)!.hash(message) : xofFunction(family, testCase.algorithm)!.xof(message, outputBytes);
    expect(toHex(output)).toBe(testCase.output ?? testCase.md);
  });

  it.each(cshakeSamples.cases)('$name, also through run()', (sample) => {
    const custom = { functionName: utf8Bytes(sample.functionName), customization: utf8Bytes(sample.customization) };
    expect(toHex(xofFunction(family, sample.algorithm)!.xof(Uint8Array.from(parseHexToArray(sample.data)), sample.outputBytes, custom))).toBe(sample.output);
    const params = { ...ABC, algorithm: sample.algorithm as KeccakAlgorithmId, encoding: 'hex' as const, input: sample.data, outputLength: String(sample.outputBytes) as Sha3Params['outputLength'], customization: sample.customization, detail: 'permutation' as const };
    expect(digest(trace(params))).toBe(sample.output);
  });
});

describe('sha3 run: steps, scope and facets', () => {
  it.each([
    ['sha3-256-abc', 124],
    ['sha3-256-1600', 245],
    ['sha3-256-abc-permutation', 5],
    ['shake128-abc-336', 245],
    ['cshake128-sample1', 245],
    ['keccak-256-abc', 124],
  ])('preset %s has %i steps', (id, count) => {
    expect(state(trace(SHA3_PRESETS.find((preset) => preset.id === id)!.params)).steps.length).toBe(count);
  });

  it('records pad, absorb, 24 × θρπχι, squeeze and output for "abc" at mapping detail', () => {
    const steps = ops(trace(ABC));
    expect(steps.slice(0, 7)).toEqual(['pad', 'absorb', 'theta', 'rho', 'pi', 'chi', 'iota']);
    expect(steps.slice(-2)).toEqual(['squeeze', 'output']);
    expect(steps.filter((op) => op === 'chi').length).toBe(24);
    expect(ops(trace({ ...ABC, detail: 'round' }))).toEqual(['pad', 'absorb', ...new Array<string>(24).fill('round'), 'squeeze', 'output']);
  });

  it('scopes block → round → op at mapping (block-level steps directly in the block), block → op otherwise', () => {
    const steps = state(trace(ABC)).steps;
    expect(steps.slice(0, 4).map((step) => step.scope)).toEqual([[0], [0], [0, 0, 0], [0, 0, 1]]);
    expect(steps[2 + 5 * 23 + 4]!.scope).toEqual([0, 23, 4]);
    expect(state(trace(ABC)).scopeLevels?.map((level) => level.labelKey)).toEqual(['plugin.sha3.scope.block', 'plugin.sha3.scope.round', 'plugin.sha3.scope.op']);
    const coarse = state(trace({ ...ABC, detail: 'permutation' }));
    expect(coarse.steps.map((step) => step.scope)).toEqual([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]);
    expect(coarse.scopeLevels?.length).toBe(2);
  });

  it('SHAKE128 with 336 bytes squeezes twice; the second permutation and squeeze get their own block scope after the absorbed block', () => {
    const bundle = trace(SHA3_PRESETS.find((preset) => preset.id === 'shake128-abc-336')!.params);
    const phases = sponge(bundle).steps.map((step) => step.phase);
    expect(phases.filter((phase) => phase === 'squeeze').length).toBe(2);
    expect(phases.indexOf('squeeze')).toBe(2 + 120);
    const squeezes = sponge(bundle).steps.filter((step) => step.phase === 'squeeze');
    expect(squeezes.map((step) => step.output!.length / 2)).toEqual([168, 168]);
    expect(digest(bundle)).toBe(squeezes.map((step) => step.output).join(''));
    const scopes = state(bundle).steps.map((step) => step.scope);
    expect(scopes[2 + 120]).toEqual([0]);
    expect(scopes[2 + 120 + 1]).toEqual([1, 0, 0]);
    expect(scopes.slice(-2)).toEqual([[1], [1]]);
  });

  it('squeeze carries only the bytes it reads out (SHAKE256, 168 bytes: 136, then 32 of the next rate block)', () => {
    const bundle = trace({ ...ABC, algorithm: 'shake256', outputLength: '168' });
    const squeezes = sponge(bundle).steps.filter((step) => step.phase === 'squeeze');
    expect(squeezes.map((step) => step.output!.length / 2)).toEqual([136, 32]);
    expect(digest(bundle)).toBe(squeezes.map((step) => step.output).join(''));
  });

  /**
   * Every step has its own scope path, except the block-level steps at detail `mapping` (pad,
   * absorb, squeeze, output), which sit directly in their block's scope `[block]` and share it.
   */
  it.each(SHA3_DETAILS)('no two steps share a scope path at %s detail (block-level steps at mapping excepted)', (detail) => {
    const blockLevel = new Set(['pad', 'absorb', 'squeeze', 'output']);
    for (const preset of [...SHA3_PRESETS, { id: 'shake256-168', params: { ...ABC, algorithm: 'shake256' as const, outputLength: '168' as const } }]) {
      const steps = state(trace({ ...preset.params, detail })).steps;
      const unique = steps.filter((step) => !(detail === 'mapping' && blockLevel.has(step.op)));
      const paths = unique.map((step) => step.scope.join('.'));
      expect(paths.filter((path, index) => paths.indexOf(path) !== index), preset.id).toEqual([]);
      if (detail === 'mapping') expect(steps.filter((step) => blockLevel.has(step.op)).every((step) => step.scope.length === 1), preset.id).toBe(true);
    }
  });

  it('the sponge facet is valid, has one step per state step and the Keccak-f[1600] shape', () => {
    for (const preset of SHA3_PRESETS) {
      const bundle = trace(preset.params);
      const facet = sponge(bundle);
      expect(validateSpongeFacet(facet, state(bundle).steps.length), preset.id).toEqual([]);
      expect(facet.steps.map((step) => step.step)).toEqual(state(bundle).steps.map((_, index) => index));
    }
    const facet = sponge(trace(ABC));
    expect(facet).toMatchObject({ label: { key: 'plugin.sha3.sponge.label' }, width: 5, height: 5, laneBits: 64, rounds: 24, rateLanes: 17 });
    expect(facet.rhoOffsets?.[1]).toBe(1);
    expect(facet.piSource?.[1]).toBe(6);
  });

  it('absorb carries the rate lanes XORed in; squeeze the bytes read out', () => {
    const steps = sponge(trace(ABC)).steps;
    const absorb = steps.find((step) => step.phase === 'absorb')!;
    expect(absorb.input?.length).toBe(17);
    expect(absorb.input?.[0]).toBe('0000000006636261');
    expect(steps.find((step) => step.phase === 'squeeze')!.output).toBe('3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532');
    expect(steps.at(-1)!.output).toBe('3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532');
  });

  it('publishes message, N/S (cSHAKE, when non-empty) and digest values', () => {
    const ids = (params: Sha3Params) => getFacet<ValuesFacet>(trace(params), 'values')!.values.map((value) => value.id);
    expect(ids(ABC)).toEqual(['message', 'digest']);
    expect(ids({ ...ABC, input: '' })).toEqual(['digest']);
    expect(ids({ ...ABC, algorithm: 'cshake256', functionName: 'KMAC', customization: 'x' })).toEqual(['message', 'n', 's', 'digest']);
  });

  it('pads with the domain suffix of each family (06, 1f, 04, 01) and names it in the narration', () => {
    const pad = (params: Sha3Params) => {
      const bundle = trace(params);
      const step = state(bundle).steps[0]!;
      return [step.narration?.key, toHex(stateAt(state(bundle), 0)['padded']!.slice(3, 4))];
    };
    expect(pad(ABC)).toEqual(['plugin.sha3.step.padSha3', '06']);
    expect(pad({ ...ABC, algorithm: 'shake256' })).toEqual(['plugin.sha3.step.padShake', '1f']);
    expect(pad({ ...ABC, algorithm: 'keccak-256' })).toEqual(['plugin.sha3.step.padKeccak', '01']);
    expect(pad({ ...ABC, algorithm: 'cshake128' })).toEqual(['plugin.sha3.step.padShake', '1f']);
    const cshake = state(trace({ ...ABC, algorithm: 'cshake128', customization: 'S' }));
    expect(cshake.steps[0]!.narration?.key).toBe('plugin.sha3.step.padCshake');
    expect(toHex(stateAt(cshake, 0)['padded']!.slice(168, 172))).toBe('61626304');
  });
});

describe('sha3 manifest and port', () => {
  it('runs every preset to the port output', () => {
    for (const { id, params } of SHA3_PRESETS) {
      const algorithm = KECCAK_ALGORITHMS[params.algorithm];
      const expected = keccakOutput(algorithm, params.encoding === 'hex' ? Uint8Array.from(parseHexToArray(params.input)) : utf8Bytes(params.input), algorithm.outputSize ?? Number(params.outputLength), { customization: utf8Bytes(params.customization) });
      expect(digest(trace(params)), id).toBe(toHex(expected));
    }
  });

  it('has the presets of docs/M6.md §2b, sha3-256-abc first', () => {
    expect(SHA3_PRESETS.map((preset) => preset.id)).toEqual([
      'sha3-256-abc',
      'sha3-224-abc',
      'sha3-384-abc',
      'sha3-512-abc',
      'sha3-256-empty',
      'sha3-256-1600',
      'sha3-256-abc-permutation',
      'shake128-abc-336',
      'shake256-empty',
      'cshake128-sample1',
      'keccak-256-abc',
    ]);
    expect(sha3Manifest.defaults).toEqual(SHA3_PRESETS[0]!.params);
  });

  it('rejects invalid params with an error, not a throw', () => {
    const result = run({ ...ABC, customization: 'x' });
    expect(result.ok ? undefined : result.error.key).toBe('plugin.sha3.error.customizationNotCshake');
  });

  it('exposes the family sha3 with functions and XOFs', () => {
    expect(family.id).toBe('sha3');
    expect(family.functions.map((fn) => fn.id)).toEqual(['sha3-224', 'sha3-256', 'sha3-384', 'sha3-512', 'keccak-256']);
    expect(family.xofs?.map((xof) => xof.id)).toEqual(['shake128', 'shake256', 'cshake128', 'cshake256']);
  });
});

describe('sha3 Mac port: Wycheproof HMAC-SHA3', () => {
  it('offers HMAC over the four SHA-3 Hash members (no HMAC-Keccak-256), naming each in the construction', () => {
    expect(ports.Mac.functions.map((fn) => [fn.id, fn.construction])).toEqual([
      ['hmac-sha3-224', { kind: 'hmac', hash: 'sha3:sha3-224' }],
      ['hmac-sha3-256', { kind: 'hmac', hash: 'sha3:sha3-256' }],
      ['hmac-sha3-384', { kind: 'hmac', hash: 'sha3:sha3-384' }],
      ['hmac-sha3-512', { kind: 'hmac', hash: 'sha3:sha3-512' }],
    ]);
  });

  it.each(namedVectors(wycheproof.cases.filter((vector) => vector.hash.startsWith('sha3-'))))('%s through ports.Mac', (_, vector) => {
    expect(vectorTagHex(hmacMemberFor(ports.Mac, vector.hash), vector)).toBe(vector.tag);
  });

  it.each(ports.Mac.functions.map((fn) => [fn.id, fn] as const))('%s contexts: split updates and clones agree with mac (long key)', (_, fn) => {
    const key = patternBytes(fn.blockSize + 1, 7);
    expect([...splitUpdateProblems(fn, key, patternBytes(2 * fn.blockSize + 3, 3)), ...cloneProblems(fn, key, patternBytes(fn.blockSize + 1, 4))]).toEqual([]);
  });
});
