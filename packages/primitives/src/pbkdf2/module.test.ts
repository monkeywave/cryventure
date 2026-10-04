import {
  getFacet,
  toHex,
  validateDerivationFacet,
  type AnyStateFacet,
  type DerivationFacet,
  type NarrationFacet,
  type PortResolver,
  type RunResult,
  type TraceBundle,
  type ValuesFacet,
} from '@cryventure/core';
import { beforeAll, describe, expect, it } from 'vitest';
import conformance from './vectors/conformance.json' with { type: 'json' };
import { PBKDF2_PRESETS, pbkdf2Manifest, type Pbkdf2Params } from './manifest.ts';
import { macDisplayName } from '../_lib/hmac/macCalls.ts';
import { run } from './module.ts';
import { resolverFor } from './testMacs.ts';

const NS = 'plugin.pbkdf2';
const TC1 = PBKDF2_PRESETS[0]!.params;
const SHA256: Pbkdf2Params = { ...TC1, mac: 'sha256:hmac-sha-256' };

let resolve: PortResolver;

beforeAll(async () => {
  // Every MAC the tests name: SHA-1 and SHA-256 (HMAC) and BLAKE2 (keyed-hash, rejected).
  const resolvers = await Promise.all([TC1, SHA256, { ...TC1, mac: 'blake2:blake2s-256' }].map(resolverFor));
  resolve = Object.assign((port: 'Mac', id: string) => resolvers.map((r) => r(port, id)).find((found) => found !== undefined), { failed: () => false }) as PortResolver;
});

function bundle(result: RunResult): TraceBundle {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.key}`);
  return result.trace;
}

const runWith = (overrides: Partial<Pbkdf2Params>) => bundle(run({ ...TC1, ...overrides }, { resolve }));

describe('pbkdf2 run: conformance', () => {
  it.each(conformance.cases.map((testCase) => [testCase.name, testCase] as const))('%s', (_name, testCase) => {
    expect(toHex(bundle(run(testCase.params as Pbkdf2Params, { resolve })).output['dk'] ?? [])).toBe(testCase.outputs.dk);
  });

  it('records the source, filter and count of its vectors', () => {
    expect(conformance.count).toBe(conformance.cases.length);
    expect(conformance.filter).toContain('TC4');
  });

  it('gives the same key for UTF-8 text and its hex', () => {
    const hex = runWith({ passwordEncoding: 'hex', password: '70617373776f7264', saltEncoding: 'hex', salt: '73616c74' });
    expect(hex.output['dk']).toEqual(runWith({}).output['dk']);
  });
});

describe('pbkdf2 run: facets', () => {
  it('produces state, values, derivation and narration that validate', () => {
    const trace = runWith({ iterations: '12', length: '30' });
    const state = getFacet<AnyStateFacet>(trace, 'state')!;
    const derivation = getFacet<DerivationFacet>(trace, 'derivation')!;
    expect(validateDerivationFacet(derivation)).toEqual([]);
    expect(getFacet<NarrationFacet>(trace, 'narration')!.entries.length).toBe(state.steps.length + 1);
    expect(getFacet<ValuesFacet>(trace, 'values')!.values.find((value) => value.id === 'password')?.role).toBe('secret');
  });

  it('warns in the first narration that the lab is a teaching tool, with the PRF name', () => {
    const state = getFacet<AnyStateFacet>(runWith({}), 'state')!;
    expect(state.initialNarration).toEqual({ key: `${NS}.step.initial`, params: { mac: 'HMAC-SHA-1', passwordBytes: 8, saltBytes: 4, iterations: 1, length: 20, count: 1 } });
  });

  it('links U₁ to the hmac lab with the Hash member, password and S ‖ INT(i) as hex', () => {
    const derivation = getFacet<DerivationFacet>(bundle(run(SHA256, { resolve })), 'derivation')!;
    expect(derivation.nodes.find((node) => node.id === '1/u1')?.zoom).toEqual({
      producerId: 'hmac',
      params: { hash: 'sha256:sha-256', key: '70617373776f7264', encoding: 'hex', input: '73616c7400000001', tagLength: 'full', expected: '' },
    });
  });

  it('narrates the total cost at the output step', () => {
    const state = getFacet<AnyStateFacet>(runWith({ iterations: '4096', length: '25' }), 'state')!;
    expect(state.steps.at(-1)?.narration).toEqual({
      key: `${NS}.step.output`,
      params: { length: 25, count: 2, iterations: 4096, calls: 8192, compressions: 16384, mac: 'HMAC-SHA-1' },
    });
  });
});

describe('pbkdf2 run: errors', () => {
  it('returns validation errors', () => {
    expect(run({ ...TC1, iterations: '0' }, { resolve })).toEqual({ ok: false, error: { key: `${NS}.error.iterations`, params: { min: 1, max: 100000 } } });
  });

  it('reports a producer that is not loaded or a member it lacks', () => {
    expect(run({ ...TC1, mac: 'md5:hmac-md5' }, { resolve })).toEqual({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'md5' } } });
    expect(run({ ...TC1, mac: 'sha1:hmac-sha-9' }, { resolve })).toEqual({ ok: false, error: { key: 'core.error.portMemberMissing', params: { id: 'sha1:hmac-sha-9' } } });
  });

  it('rejects a Mac member that is not HMAC (keyed BLAKE2)', () => {
    expect(run({ ...TC1, mac: 'blake2:blake2s-256' }, { resolve })).toEqual({ ok: false, error: { key: `${NS}.error.notHmac`, params: { id: 'blake2:blake2s-256' } } });
  });
});

describe('macDisplayName', () => {
  it('upper-cases the member id', () => {
    expect(macDisplayName({ id: 'hmac-sha-512/256' })).toBe('HMAC-SHA-512/256');
  });
});

describe('pbkdf2Manifest', () => {
  it('runs in a worker and lazily loads a module with run()', async () => {
    expect(pbkdf2Manifest.runIn).toBe('worker');
    expect(typeof (await pbkdf2Manifest.load()).run).toBe('function');
  });
});
