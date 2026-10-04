import {
  getFacet,
  parseHexOrThrow,
  toHex,
  utf8Bytes,
  type AnyStateFacet,
  type DerivationFacet,
  type NarrationFacet,
  type RunResult,
  type TraceBundle,
  type ValuesFacet,
} from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { portResolverFor } from '../testing/hmacPorts.ts';
import { HMAC_SHA256, HMAC_SHA384, HMAC_SHA512, oracleTls12 } from '../_lib/prf/testMacs.ts';
import conformance from './vectors/conformance.json' with { type: 'json' };
import { TLS12_PRF_OP_NAMES, TLS12_PRF_PRESETS, tls12PrfManifest, validateTls12PrfParams, type Tls12PrfParams } from './manifest.ts';
import { run } from './module.ts';

const NS = 'plugin.tls12-prf';

const presetParams = (id: string): Tls12PrfParams => TLS12_PRF_PRESETS.find((preset) => preset.id === id)!.params;
const DEFAULTS = tls12PrfManifest.defaults;

async function runWithPorts(params: Tls12PrfParams): Promise<RunResult> {
  return run(params, { resolve: await portResolverFor(tls12PrfManifest, params) });
}

async function trace(params: Tls12PrfParams): Promise<TraceBundle> {
  const result = await runWithPorts(params);
  if (!result.ok) throw new Error(`run failed: ${result.error.key}`);
  return result.trace;
}

const outputHex = (bundle: TraceBundle) => toHex(bundle.output['output'] ?? []);
const expectedFor = (name: string) => conformance.cases.find((c) => c.name === name)!.outputs.output;

describe('tls12-prf presets', () => {
  it('derives the CAVP [TLS 1.2, SHA-256] COUNT=0 master secret and key block', async () => {
    expect(outputHex(await trace(presetParams('tls12-master-secret')))).toBe('202c88c00f84a17a20027079604787461176455539e705be730890602c289a5001e34eeb3a043e5d52a65e66125188bf');
    expect(outputHex(await trace(presetParams('tls12-key-expansion')))).toBe(expectedFor('CAVP SP 800-135 TLS [TLS 1.2, SHA-256] COUNT=0 key block'));
  });

  it('derives the CAVP [TLS 1.2, SHA-384] COUNT=0 master secret with HMAC-SHA-384', async () => {
    expect(outputHex(await trace(presetParams('tls12-sha384')))).toBe(expectedFor('CAVP SP 800-135 TLS [TLS 1.2, SHA-384] COUNT=0 master secret'));
  });

  it('derives the RFC 7627 extended master secret of the computed vector', async () => {
    const ems = conformance.cases.find((c) => c.params.label === 'extended master secret')!;
    expect(ems.params).toEqual(presetParams('tls12-ems'));
    expect(outputHex(await trace(presetParams('tls12-ems')))).toBe(ems.outputs.output);
  });
});

describe('tls12-prf run against the independent oracle', () => {
  it.each([
    ['HMAC-SHA-256, 1-byte secret, empty seed, 1 byte', { mac: 'sha256:hmac-sha-256', secret: '07', label: 'a', seed: '', length: '1' }, HMAC_SHA256],
    ['HMAC-SHA-384, 100 bytes', { mac: 'sha512:hmac-sha-384', secret: '0f'.repeat(20), label: 'key expansion', seed: 'ab'.repeat(64), length: '100' }, HMAC_SHA384],
    ['HMAC-SHA-512, the limits', { mac: 'sha512:hmac-sha-512', secret: 'fe'.repeat(256), label: 'x'.repeat(64), seed: '01'.repeat(128), length: '256' }, HMAC_SHA512],
  ] as const)('%s', async (_name, params, mac) => {
    const expected = oracleTls12(mac, parseHexOrThrow(params.secret), params.label, parseHexOrThrow(params.seed), Number(params.length));
    expect(outputHex(await trace(params))).toBe(toHex(expected));
  });
});

describe('tls12-prf trace', () => {
  it('records seed in block 1, then A(i) and P(i) per block, and output in the last block', async () => {
    const state = getFacet<AnyStateFacet>(await trace(DEFAULTS), 'state')!;
    expect(state.steps.map((step) => [step.op, step.scope])).toEqual([
      ['seed', [0, 0]],
      ['a', [0, 1]],
      ['p', [0, 2]],
      ['a', [1, 0]],
      ['p', [1, 1]],
      ['output', [1, 2]],
    ]);
    expect(state.scopeLevels?.map((level) => level.labelKey)).toEqual([`${NS}.scope.block`, `${NS}.scope.op`]);
    expect(state.steps.every((step) => (TLS12_PRF_OP_NAMES as readonly string[]).includes(step.op))).toBe(true);
  });

  it('sizes the regions from the inputs and the HMAC', async () => {
    const state = getFacet<AnyStateFacet>(await trace(DEFAULTS), 'state')!;
    expect(Object.fromEntries(state.regions.map((region) => [region.id, region.shape[0]]))).toEqual({ secret: 48, labelSeed: 77, a: 32, p: 32, stream: 64, output: 48 });
    expect(state.initialNarration).toMatchObject({ key: `${NS}.step.initial`, params: { prf: 'P_SHA-256', mac: 'HMAC-SHA-256', n: 2, length: 48, hashLength: 32 } });
  });

  it('narrates the discarded tail, or that nothing is discarded', async () => {
    const narration = async (length: string) => getFacet<NarrationFacet>(await trace({ ...DEFAULTS, length }), 'narration')!.entries.at(-1)!.ref;
    expect(await narration('48')).toEqual({ key: `${NS}.step.output`, params: { length: 48, streamLength: 64, discarded: 16 } });
    expect(await narration('64')).toEqual({ key: `${NS}.step.outputExact`, params: { length: 64, n: 2 } });
  });

  it('publishes the secret, label ‖ seed and the output as values', async () => {
    const bundle = await trace(DEFAULTS);
    const values = getFacet<ValuesFacet>(bundle, 'values')!.values;
    expect(values.map((value) => [value.id, value.role, value.createdAt])).toEqual([
      ['secret', 'secret', -1],
      ['labelSeed', 'public', 0],
      ['output', 'secret', 5],
    ]);
    expect(toHex(values[2]!.bytes)).toBe(outputHex(bundle));
  });

  it('derives the output from the P blocks, each HMAC node zooming into the hmac lab', async () => {
    const derivation = getFacet<DerivationFacet>(await trace(DEFAULTS), 'derivation')!;
    expect(derivation.title).toEqual({ key: `${NS}.derivation.title` });
    expect(derivation.nodes.map((node) => node.id)).toEqual(['secret', 'label', 'seed', 'labelSeed', 'prf/a/1', 'prf/p/1', 'prf/a/2', 'prf/p/2', 'output']);
    const output = derivation.nodes.at(-1)!;
    expect(output).toMatchObject({ op: 'truncate', inputs: ['prf/p/1', 'prf/p/2'], result: true, valueRef: 'output', step: 5 });
    const zoomed = derivation.nodes.filter((node) => node.zoom !== undefined);
    expect(zoomed.map((node) => node.id)).toEqual(['prf/a/1', 'prf/p/1', 'prf/a/2', 'prf/p/2']);
    expect(zoomed[0]!.zoom).toEqual({
      producerId: 'hmac',
      params: { hash: 'sha256:sha-256', key: DEFAULTS.secret, encoding: 'hex', input: toHex(utf8Bytes('master secret')) + DEFAULTS.seed, tagLength: 'full', expected: '' },
    });
  });
});

describe('tls12-prf run errors', () => {
  it('reports a MAC that is not an HMAC (keyed BLAKE2)', async () => {
    expect(await runWithPorts({ ...DEFAULTS, mac: 'blake2:blake2s-256' })).toEqual({ ok: false, error: { key: `${NS}.error.notHmac`, params: { id: 'blake2:blake2s-256' } } });
  });

  it('reports a member the producer does not offer, and a run without ports', async () => {
    expect(await runWithPorts({ ...DEFAULTS, mac: 'sha256:hmac-sha-1' })).toEqual({ ok: false, error: { key: 'core.error.portMemberMissing', params: { id: 'sha256:hmac-sha-1' } } });
    expect(run(DEFAULTS)).toMatchObject({ ok: false, error: { key: 'core.error.portMissing' } });
  });

  it('returns the validation error for bad params', () => {
    expect(run({ ...DEFAULTS, length: '257' })).toEqual({ ok: false, error: { key: `${NS}.error.length` } });
  });
});

describe('validateTls12PrfParams', () => {
  it('normalises the shared inputs and keeps the MAC ref', () => {
    expect(validateTls12PrfParams({ ...DEFAULTS, secret: DEFAULTS.secret.toUpperCase(), length: '048' })).toEqual({ ok: true, value: DEFAULTS });
  });

  it.each([
    [null, { key: `${NS}.error.invalidParams` }],
    [{ ...DEFAULTS, mac: 'sha256' }, { key: `${NS}.error.mac` }],
    [{ ...DEFAULTS, label: 'ünicode' }, { key: `${NS}.error.label` }],
  ])('rejects %j', (params, error) => {
    expect(validateTls12PrfParams(params)).toEqual({ ok: false, error });
  });
});

describe('tls12PrfManifest', () => {
  it('defaults to the master-secret preset over HMAC-SHA-256', () => {
    expect(DEFAULTS).toEqual(presetParams('tls12-master-secret'));
    expect(DEFAULTS.mac).toBe('sha256:hmac-sha-256');
  });

  it('lazily loads a module with run()', async () => {
    expect(typeof (await tls12PrfManifest.load()).run).toBe('function');
  });
});
