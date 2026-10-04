import {
  getFacet,
  parseHexOrThrow,
  preparePorts,
  Registry,
  toHex,
  utf8Bytes,
  type AnyStateFacet,
  type DerivationFacet,
  type I18nRef,
  type PrimitiveManifest,
  type RunResult,
  type TraceBundle,
  type ValuesFacet,
} from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { describe, expect, it } from 'vitest';
import { oracleTls10 } from '../_lib/prf/testMacs.ts';
import { tls10PrfManifest, validateTls10PrfParams, type Tls10PrfParams } from './manifest.ts';
import { run } from './module.ts';

const NS = 'plugin.tls10-prf';
const registry = new Registry<PrimitiveManifest>('producers');
primitiveManifests.forEach((manifest) => registry.register(manifest));

const DEFAULTS = tls10PrfManifest.defaults;
/** CAVP SP 800-135 TLS [TLS 1.0/1.1] COUNT=0 master secret. */
const CAVP_MASTER_SECRET = '2f6962dfbc744c4b2138bb6b3d33054c5ecc14f24851d9896395a44ab3964efc2090c5bf51a0891209f46c1e1e998f62';
/** An odd-length (5-byte) secret, so S1 and S2 share the middle byte. */
const ODD: Tls10PrfParams = { ...DEFAULTS, secret: '0102030405', label: 'test label', seed: 'aabb', length: '40' };

async function runWithPorts(params: Tls10PrfParams): Promise<RunResult> {
  return run(params, { resolve: await preparePorts(tls10PrfManifest, params, registry) });
}

async function trace(params: Tls10PrfParams): Promise<TraceBundle> {
  const result = await runWithPorts(params);
  if (!result.ok) throw new Error(`run failed: ${result.error.key}`);
  return result.trace;
}

const repeat = (items: string[], times: number): string[] => Array.from({ length: times }, () => items).flat();
const outputHex = (bundle: TraceBundle) => toHex(bundle.output['output'] ?? []);
const stepNarration = (state: AnyStateFacet, op: string) => state.steps.find((step) => step.op === op)!.narration as I18nRef;

describe('tls10-prf outputs', () => {
  it('derives the CAVP [TLS 1.0/1.1] COUNT=0 master secret (the default preset)', async () => {
    expect(outputHex(await trace(DEFAULTS))).toBe(CAVP_MASTER_SECRET);
  });

  it('splits an odd-length secret with a shared middle byte (value from @noble/hashes, scratch oracle)', async () => {
    expect(outputHex(await trace(ODD))).toBe('16ccf2af0d445d2b2576fbee9e0c309391d86daaa92f385773a43e1804082a65723249fe4b45241f');
  });

  it.each([
    ['1-byte secret, 1 byte', { ...DEFAULTS, secret: '7f', seed: '', length: '1' }],
    ['47-byte secret, 104 bytes', { ...DEFAULTS, secret: '5a'.repeat(47), length: '104' }],
    ['the limits', { ...DEFAULTS, secret: 'c3'.repeat(256), label: 'y'.repeat(64), seed: '02'.repeat(128), length: '256' }],
  ])('matches the independent oracle: %s', async (_name, params) => {
    const expected = oracleTls10(parseHexOrThrow(params.secret), params.label, parseHexOrThrow(params.seed), Number(params.length));
    expect(outputHex(await trace(params))).toBe(toHex(expected));
  });
});

describe('tls10-prf trace', () => {
  it('records split, seed and P_MD5 in half 1, P_SHA-1, xor and output in half 2', async () => {
    const state = getFacet<AnyStateFacet>(await trace(DEFAULTS), 'state')!;
    const ops = state.steps.map((step) => `${step.scope[0]}:${step.op}`);
    expect(ops).toEqual(['0:split', '0:seed', ...repeat(['0:a', '0:p'], 3), ...repeat(['1:a', '1:p'], 3), '1:xor', '1:output']);
    expect(state.steps.every((step) => step.scope.length === 2)).toBe(true);
    expect(state.scopeLevels?.map((level) => level.labelKey)).toEqual([`${NS}.scope.half`, `${NS}.scope.op`]);
  });

  it('keys P_MD5 with S1 and P_SHA-1 with S2', async () => {
    const state = getFacet<AnyStateFacet>(await trace(DEFAULTS), 'state')!;
    const firstA = state.steps.filter((step) => step.op === 'a').map((step) => step.narration as I18nRef);
    expect(firstA[0]?.params).toMatchObject({ prf: 'P_MD5', mac: 'HMAC-MD5', key: 'S1', n: 3 });
    expect(firstA[3]?.params).toMatchObject({ prf: 'P_SHA-1', mac: 'HMAC-SHA-1', key: 'S2', n: 3 });
    expect(Object.fromEntries(state.regions.map((region) => [region.id, region.shape[0]]))).toMatchObject({ s1: 24, s2: 24, a1: 16, stream1: 48, a2: 20, stream2: 60, output: 48 });
  });

  it('narrates an even split, and the shared middle byte of an odd one', async () => {
    const even = getFacet<AnyStateFacet>(await trace(DEFAULTS), 'state')!;
    expect(stepNarration(even, 'split')).toEqual({ key: `${NS}.step.split`, params: { length: 48, half: 24 } });
    const odd = getFacet<AnyStateFacet>(await trace(ODD), 'state')!;
    expect(stepNarration(odd, 'split')).toEqual({ key: `${NS}.step.splitOdd`, params: { length: 5, half: 3, middle: 3 } });
    const split = odd.steps.find((step) => step.op === 'split')!;
    expect(split.writes.map((write) => [write.region, toHex(write.values)])).toEqual([
      ['s1', '010203'],
      ['s2', '030405'],
    ]);
  });

  it('notes in the initial narration that RFC 2246 fixes MD5 and SHA-1, and which HMACs ran', async () => {
    const state = getFacet<AnyStateFacet>(await trace(DEFAULTS), 'state')!;
    expect(state.initialNarration).toMatchObject({ key: `${NS}.step.initial`, params: { md5Mac: 'HMAC-MD5', sha1Mac: 'HMAC-SHA-1', length: 48 } });
  });

  it('counts the unused bytes of each stream in the output narration', async () => {
    const state = getFacet<AnyStateFacet>(await trace(DEFAULTS), 'state')!;
    expect(stepNarration(state, 'output').params).toEqual({ length: 48, output: CAVP_MASTER_SECRET, md5Blocks: 3, md5Unused: 0, sha1Blocks: 3, sha1Unused: 12 });
  });

  it('publishes secret, S1, S2, label ‖ seed and the output as values', async () => {
    const values = getFacet<ValuesFacet>(await trace(ODD), 'values')!.values;
    expect(values.map((value) => [value.id, value.role, toHex(value.bytes)])).toEqual([
      ['secret', 'secret', '0102030405'],
      ['s1', 'secret', '010203'],
      ['s2', 'secret', '030405'],
      ['labelSeed', 'public', toHex(utf8Bytes('test label')) + 'aabb'],
      ['output', 'secret', '16ccf2af0d445d2b2576fbee9e0c309391d86daaa92f385773a43e1804082a65723249fe4b45241f'],
    ]);
  });

  it('derives the output as the XOR of both truncated streams, zooming into the hmac lab per half', async () => {
    const derivation = getFacet<DerivationFacet>(await trace(DEFAULTS), 'derivation')!;
    const node = (id: string) => derivation.nodes.find((candidate) => candidate.id === id)!;
    expect(node('s1')).toMatchObject({ op: 'split', inputs: ['secret'], result: true });
    expect(node('md5/stream')).toMatchObject({ op: 'truncate', inputs: ['md5/p/1', 'md5/p/2', 'md5/p/3'] });
    expect(node('output')).toMatchObject({ op: 'xor', inputs: ['md5/stream', 'sha1/stream'], result: true, valueRef: 'output' });
    expect(node('md5/a/1').zoom?.params).toMatchObject({ hash: 'md5:md5', key: DEFAULTS.secret.slice(0, 48) });
    expect(node('sha1/p/3').zoom?.params).toMatchObject({ hash: 'sha1:sha-1', key: DEFAULTS.secret.slice(48) });
  });
});

describe('tls10-prf run errors', () => {
  it('reports a MAC that is not an HMAC, and a missing member', async () => {
    expect(await runWithPorts({ ...DEFAULTS, sha1Mac: 'blake2:blake2b-512' })).toEqual({ ok: false, error: { key: `${NS}.error.notHmac`, params: { id: 'blake2:blake2b-512' } } });
    expect(await runWithPorts({ ...DEFAULTS, md5Mac: 'md5:hmac-sha-1' })).toEqual({ ok: false, error: { key: 'core.error.portMemberMissing', params: { id: 'md5:hmac-sha-1' } } });
  });

  it('runs with other HMACs too (not the RFC 2246 PRF any more, but well defined)', async () => {
    expect((await runWithPorts({ ...DEFAULTS, md5Mac: 'sha256:hmac-sha-256' })).ok).toBe(true);
  });
});

describe('validateTls10PrfParams', () => {
  it('normalises the shared inputs and keeps both MAC refs', () => {
    expect(validateTls10PrfParams({ ...DEFAULTS, seed: DEFAULTS.seed.toUpperCase() })).toEqual({ ok: true, value: DEFAULTS });
  });

  it.each([
    [null, { key: `${NS}.error.invalidParams` }],
    [{ ...DEFAULTS, md5Mac: '' }, { key: `${NS}.error.md5Mac` }],
    [{ ...DEFAULTS, sha1Mac: 'sha1' }, { key: `${NS}.error.sha1Mac` }],
    [{ ...DEFAULTS, secret: '' }, { key: `${NS}.error.secretLength`, params: { length: 0 } }],
  ])('rejects %j', (params, error) => {
    expect(validateTls10PrfParams(params)).toEqual({ ok: false, error });
  });
});

describe('tls10PrfManifest', () => {
  it('defaults to HMAC-MD5 and HMAC-SHA-1 and lazily loads a module with run()', async () => {
    expect([DEFAULTS.md5Mac, DEFAULTS.sha1Mac]).toEqual(['md5:hmac-md5', 'sha1:hmac-sha-1']);
    expect(typeof (await tls10PrfManifest.load()).run).toBe('function');
  });
});
