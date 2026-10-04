import {
  assertTopologicalOrder,
  getFacet,
  hashFunction,
  parseHexOrThrow,
  preparePorts,
  Registry,
  toHex,
  utf8Bytes,
  validateDerivationFacet,
  validateMathFacet,
  type AnyStateFacet,
  type DerivationFacet,
  type HashFamily,
  type MathFacet,
  type NarrationFacet,
  type PortResolver,
  type PrimitiveManifest,
  type RunResult,
  type TraceBundle,
  type ValuesFacet,
} from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { beforeAll, describe, expect, it } from 'vitest';
import { hmacFunction } from '../_lib/hmac/hmac.ts';
import conformance from './vectors/conformance.json' with { type: 'json' };
import { HMAC_PRESETS, hmacManifest, type HmacParams } from './manifest.ts';
import { run } from './module.ts';

const NS = 'plugin.hmac';
const BASE: HmacParams = hmacManifest.defaults as HmacParams;
const TC1_SHA256 = 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7';

/** Hash families of every registered `Hash` producer, by producer id. */
const families = new Map<string, HashFamily>();
let resolve: PortResolver;

beforeAll(async () => {
  for (const manifest of primitiveManifests.filter((candidate) => candidate.implements.includes('Hash'))) {
    const family = (await manifest.load()).ports?.Hash;
    if (family !== undefined) families.set(manifest.id, family);
  }
  resolve = ((port: string, id: string) => (port === 'Hash' ? families.get(id) : undefined)) as PortResolver;
});

function bundle(result: RunResult): TraceBundle {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.key} ${JSON.stringify(result.error.params)}`);
  return result.trace;
}

const runWith = (overrides: Partial<HmacParams> = {}) => bundle(run({ ...BASE, ...overrides }, { resolve }));
const tagOf = (trace: TraceBundle) => toHex(trace.output['tag'] ?? []);
const stateOf = (trace: TraceBundle) => getFacet<AnyStateFacet>(trace, 'state')!;
const narrationKeys = (trace: TraceBundle) => getFacet<NarrationFacet>(trace, 'narration')!.entries.map((entry) => entry.ref.key);
const stepNarration = (trace: TraceBundle, op: string) => stateOf(trace).steps.find((step) => step.op === op)?.narration;
const presetParams = (id: string) => HMAC_PRESETS.find((preset) => preset.id === id)!.params;

/** The untraced reference: HMAC through `_lib/hmac` on the port's hash function. */
function referenceTag(params: HmacParams): string {
  const [producerId = '', memberId = ''] = params.hash.split(':');
  const hash = hashFunction(families.get(producerId)!, memberId)!;
  const message = params.encoding === 'hex' ? parseHexOrThrow(params.input) : utf8Bytes(params.input);
  return toHex(hmacFunction(hash, params.hash, 'reference').mac(parseHexOrThrow(params.key), message));
}

describe('hmac run', () => {
  it('computes RFC 4231 test case 1 (HMAC-SHA-256)', () => {
    expect(tagOf(runWith())).toBe(TC1_SHA256);
  });

  it('records keyPrep → ipad → innerBlock → innerMessage → opad → outerBlock → outer, one op per scope', () => {
    const steps = stateOf(runWith()).steps;
    expect(steps.map((step) => step.op)).toEqual(['keyPrep', 'ipad', 'innerBlock', 'innerMessage', 'opad', 'outerBlock', 'outer']);
    expect(steps.map((step) => step.scope)).toEqual([[0], [1], [2], [3], [4], [5], [6]]);
  });

  it('says at step −1 what is computed and that the lab is no place for real keys', () => {
    const state = stateOf(runWith());
    expect(state.initialNarration).toEqual({
      key: `${NS}.step.initial`,
      params: { hash: 'SHA-256', blockSize: 64, outputLength: 32, keyLength: 20, messageLength: 8, tagLength: 32 },
    });
    expect(narrationKeys(runWith())[0]).toBe(`${NS}.step.initial`);
  });

  it('reports a missing hash producer or member as a run error', () => {
    expect(run({ ...BASE, hash: 'nope:sha-256' }, { resolve })).toEqual({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'nope' } } });
    expect(run({ ...BASE, hash: 'sha256:sha-999' }, { resolve })).toEqual({ ok: false, error: { key: 'core.error.portMemberMissing', params: { id: 'sha256:sha-999' } } });
  });

  it('works with the real port preparation (preparePorts loads only the named hash producer)', async () => {
    const registry = new Registry<PrimitiveManifest>('producers');
    primitiveManifests.forEach((manifest) => registry.register(manifest));
    const prepared = await preparePorts(hmacManifest, BASE, registry);
    expect(tagOf(bundle(run(BASE, { resolve: prepared })))).toBe(TC1_SHA256);
  });
});

describe('keyPrep: the three K0 branches', () => {
  it('pads a key shorter than B with zero bytes', () => {
    const trace = runWith();
    expect(stepNarration(trace, 'keyPrep')).toEqual({ key: `${NS}.step.keyPrep.padded`, params: { keyLength: 20, blockSize: 64, zeros: 44 } });
  });

  it('takes a key of exactly B bytes as is', () => {
    const key = '5a'.repeat(64);
    const trace = runWith({ key });
    expect(stepNarration(trace, 'keyPrep')).toEqual({ key: `${NS}.step.keyPrep.exact`, params: { blockSize: 64 } });
    expect(stateOf(trace).steps[0]!.writes[0]!.values).toEqual(Array.from(parseHexOrThrow(key)));
  });

  it('hashes a key longer than B first and narrates H(K) (RFC 4231 test case 6)', () => {
    const params = presetParams('rfc4231-tc6-longkey');
    const trace = bundle(run(params, { resolve }));
    const keyDigest = toHex(hashFunction(families.get('sha256')!, 'sha-256')!.hash(parseHexOrThrow(params.key)));
    expect(stepNarration(trace, 'keyPrep')).toEqual({
      key: `${NS}.step.keyPrep.hashed`,
      params: { keyLength: 131, blockSize: 64, hash: 'SHA-256', digest: keyDigest, zeros: 32 },
    });
    expect(tagOf(trace)).toBe('60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54');
    const nodes = getFacet<DerivationFacet>(trace, 'derivation')!.nodes;
    expect(nodes.find((node) => node.id === 'keyDigest')?.bytes).toEqual(Array.from(parseHexOrThrow(keyDigest)));
  });

  it('accepts an empty key (K0 is all zeros)', () => {
    const trace = runWith({ key: '' });
    expect(tagOf(trace)).toBe(referenceTag({ ...BASE, key: '' }));
    expect(stateOf(trace).regions.map((region) => region.id)).not.toContain('key');
  });
});

describe('midstates', () => {
  it('shows both midstates when the hash exposes its chaining state', () => {
    const trace = runWith();
    const regions = stateOf(trace).regions;
    expect(regions.map((region) => region.id)).toEqual(['key', 'k0', 'ipadKey', 'innerState', 'message', 'inner', 'opadKey', 'outerState', 'tag']);
    expect(regions.find((region) => region.id === 'innerState')?.shape).toEqual([32]);
    expect(stepNarration(trace, 'innerBlock')).toEqual({ key: `${NS}.step.innerBlock.midstate`, params: { hash: 'SHA-256', stateLength: 32 } });
    const values = getFacet<ValuesFacet>(trace, 'values')!.values;
    expect(values.filter((value) => value.role === 'secret').map((value) => value.id)).toEqual(['k0', 'ipadKey', 'innerState', 'opadKey', 'outerState']);
  });

  it('the inner midstate is SHA-256 after one block of K0 ⊕ ipad (the H words, big-endian)', () => {
    const trace = runWith();
    const ipadKey = stateOf(trace).steps[1]!.writes[0]!.values;
    const context = hashFunction(families.get('sha256')!, 'sha-256')!.create();
    context.update(Uint8Array.from(ipadKey));
    expect(stateOf(trace).steps[2]!.writes[0]!.values).toEqual(Array.from(context.chainingState!()));
  });

  it('has no midstate regions when the hash offers no chainingState', () => {
    const sha256 = hashFunction(families.get('sha256')!, 'sha-256')!;
    const plain: HashFamily = {
      id: 'plain',
      functions: [{ ...sha256, id: 'sha-256', create: () => { const context = sha256.create(); return { update: (data) => context.update(data), digest: () => context.digest(), clone: () => context.clone() }; } }],
    };
    const plainResolve = ((port: string, id: string) => (port === 'Hash' && id === 'plain' ? plain : undefined)) as PortResolver;
    const trace = bundle(run({ ...BASE, hash: 'plain:sha-256' }, { resolve: plainResolve }));
    expect(tagOf(trace)).toBe(TC1_SHA256);
    expect(stateOf(trace).regions.map((region) => region.id)).toEqual(['key', 'k0', 'ipadKey', 'message', 'inner', 'opadKey', 'tag']);
    expect(stepNarration(trace, 'outerBlock')).toEqual({ key: `${NS}.step.outerBlock.noMidstate`, params: { hash: 'SHA-256' } });
    expect(getFacet<ValuesFacet>(trace, 'values')!.values.map((value) => value.id)).not.toContain('innerState');
  });

  it('has no midstate for BLAKE2, which keeps the last full block until it knows it is final', () => {
    const trace = runWith({ hash: 'blake2:blake2s-256' });
    expect(stateOf(trace).regions.map((region) => region.id)).not.toContain('innerState');
    expect(tagOf(trace)).toBe(referenceTag({ ...BASE, hash: 'blake2:blake2s-256' }));
  });

  it('shows the 200-byte Keccak state as the SHA3 midstate (B = rate = 136)', () => {
    const trace = bundle(run(presetParams('hmac-sha3-256-sample'), { resolve }));
    const regions = stateOf(trace).regions;
    expect(regions.find((region) => region.id === 'k0')?.shape).toEqual([136]);
    expect(regions.find((region) => region.id === 'innerState')?.shape).toEqual([200]);
  });
});

describe('truncation', () => {
  it('cuts the tag to t bytes (RFC 4231 test case 5)', () => {
    const trace = bundle(run(presetParams('rfc4231-tc5-trunc'), { resolve }));
    expect(tagOf(trace)).toBe('a3b6167473100ee06e0c796c2955552b');
    expect(stateOf(trace).steps.at(-1)?.op).toBe('truncate');
    expect(stepNarration(trace, 'truncate')).toEqual({ key: `${NS}.step.truncate`, params: { tagLength: 16, outputLength: 32, min: 16, tag: 'a3b6167473100ee06e0c796c2955552b' } });
    const tag = getFacet<DerivationFacet>(trace, 'derivation')!.nodes.at(-1);
    expect(tag).toMatchObject({ id: 'tag', op: 'truncate', inputs: ['outer'] });
  });

  it.each([
    ['sha512:sha-512', '16', { length: 16, min: 32, max: 64, hash: 'SHA-512' }],
    ['sha256:sha-256', '12', { length: 12, min: 16, max: 32, hash: 'SHA-256' }],
    ['md5:md5', '20', { length: 20, min: 10, max: 16, hash: 'MD5' }],
    ['sha256:sha-224', '32', { length: 32, min: 14, max: 28, hash: 'SHA-224' }],
  ] as const)('%s with %s bytes is a run error (max(10, L/2) ≤ t ≤ L)', (hash, tagLength, params) => {
    expect(run({ ...BASE, hash, tagLength }, { resolve })).toEqual({ ok: false, error: { key: `${NS}.error.tagLength`, params } });
  });

  it.each([
    ['md5:md5', '10'],
    ['sha1:sha-1', '12'],
    ['sha512:sha-512', '32'],
    ['sha256:sha-224', '28'],
  ] as const)('%s accepts %s bytes', (hash, tagLength) => {
    const trace = runWith({ hash, tagLength });
    expect(trace.output['tag']).toHaveLength(Number(tagLength));
    expect(tagOf(trace)).toBe(referenceTag({ ...BASE, hash }).slice(0, 2 * Number(tagLength)));
  });
});

describe('verify', () => {
  it('PASS: equal tags, verified = 01', () => {
    const trace = bundle(run(presetParams('verify-pass'), { resolve }));
    expect(trace.output['verified']).toEqual([1]);
    expect(stepNarration(trace, 'verify')).toEqual({ key: `${NS}.step.verify.pass`, params: { expectedLength: 32, accumulator: '00' } });
  });

  it('FAIL: the last byte differs, verified = 00, and the loop still covered every byte', () => {
    const trace = bundle(run(presetParams('verify-fail'), { resolve }));
    expect(trace.output['verified']).toEqual([0]);
    expect(stepNarration(trace, 'verify')).toEqual({ key: `${NS}.step.verify.fail`, params: { expectedLength: 32, accumulator: '01', differences: 1 } });
    const highlights = stateOf(trace).steps.at(-1)!.highlights;
    expect(highlights.map((entry) => [entry.region, entry.indices.length])).toEqual([['expected', 32], ['tag', 32]]);
  });

  it('FAIL on a length mismatch after a full pass over the expected tag', () => {
    const trace = runWith({ expected: TC1_SHA256.slice(0, 40) });
    expect(trace.output['verified']).toEqual([0]);
    expect(stepNarration(trace, 'verify')).toEqual({ key: `${NS}.step.verify.lengthMismatch`, params: { expectedLength: 20, tagLength: 32 } });
  });

  it('compares against the truncated tag', () => {
    const trace = runWith({ tagLength: '16', expected: TC1_SHA256.slice(0, 32) });
    expect(trace.output['verified']).toEqual([1]);
    expect(stateOf(trace).steps.slice(-2).map((step) => step.op)).toEqual(['truncate', 'verify']);
  });

  it('computes only (no verify step, no verified output) without an expected tag', () => {
    const trace = runWith();
    expect(trace.output['verified']).toBeUndefined();
    expect(stateOf(trace).steps.map((step) => step.op)).not.toContain('verify');
  });
});

describe('derivation facet', () => {
  it('is titled HMAC, topologically ordered and valid: key → K0 → pad keys → inner → tag', () => {
    const facet = getFacet<DerivationFacet>(runWith(), 'derivation')!;
    expect(validateDerivationFacet(facet)).toEqual([]);
    assertTopologicalOrder(facet);
    expect(facet.title).toEqual({ key: `${NS}.derivation.title` });
    expect(facet.nodes.filter((node) => node.result).map((node) => node.id)).toEqual(['key', 'k0', 'message', 'ipadKey', 'inner', 'opadKey', 'tag']);
    expect(facet.nodes.find((node) => node.id === 'k0')).toMatchObject({ op: 'concat', inputs: ['key', 'zeros'] });
    expect(facet.nodes.find((node) => node.id === 'ipadKey')).toMatchObject({ op: 'xor', inputs: ['k0', 'ipad'] });
  });

  it('links the inner and outer hash to the SHA-256 lab via its hashLabParams', () => {
    const trace = runWith();
    const nodes = getFacet<DerivationFacet>(trace, 'derivation')!.nodes;
    const sha256 = primitiveManifests.find((manifest) => manifest.id === 'sha256')!;
    for (const id of ['inner', 'tag']) {
      const node = nodes.find((candidate) => candidate.id === id)!;
      const input = nodes.find((candidate) => candidate.id === `${id === 'inner' ? 'inner' : 'outer'}Input`)!;
      expect(node.zoom).toEqual({ producerId: 'sha256', params: sha256.hashLabParams!('sha-256', toHex(input.bytes)) });
    }
  });

  it('the zoomed hash lab computes exactly the node bytes', async () => {
    const trace = runWith();
    const inner = getFacet<DerivationFacet>(trace, 'derivation')!.nodes.find((node) => node.id === 'inner')!;
    const sha256 = primitiveManifests.find((manifest) => manifest.id === 'sha256')!;
    const zoomed = (await sha256.load()).run(inner.zoom!.params);
    expect(zoomed.ok && zoomed.trace.output['digest']).toEqual(inner.bytes);
  });

  it('has no zoom when the hash lab cannot take the input (SHA-512: 128 + 20 bytes > 128)', () => {
    const nodes = getFacet<DerivationFacet>(runWith({ hash: 'sha512:sha-512' }), 'derivation')!.nodes;
    expect(nodes.find((node) => node.id === 'inner')?.zoom).toBeUndefined();
    expect(nodes.find((node) => node.id === 'tag')?.zoom).toBeUndefined();
  });
});

describe('math facet', () => {
  it('shows bit strips on ipad and opad: 36, 5c and 36 ⊕ 5c = 6a (4 of 8 bits differ)', () => {
    const trace = runWith();
    const math = getFacet<MathFacet>(trace, 'math')!;
    expect(validateMathFacet(math)).toEqual([]);
    const steps = stateOf(trace).steps;
    expect(math.steps.map((step) => steps[step.step]?.op)).toEqual(['ipad', 'opad']);
    const [ipad, opad] = math.steps;
    expect(ipad!.terms.map((term) => [term.id, term.value])).toEqual([['k0Byte', 0x0b], ['ipad', 0x36], ['ipadKeyByte', 0x0b ^ 0x36]]);
    const difference = opad!.terms.find((term) => term.id === 'padDifference')!;
    expect(difference).toMatchObject({ value: 0x6a, bits: [1, 3, 5, 6] });
  });
});

describe('presets and conformance vectors', () => {
  it.each(HMAC_PRESETS.map((preset) => [preset.id, preset.params] as const))('preset %s equals HMAC through the Mac lib', (_, params) => {
    expect(tagOf(bundle(run(params, { resolve })))).toBe(referenceTag(params).slice(0, 2 * (bundle(run(params, { resolve })).output['tag']?.length ?? 0)));
  });

  it('reproduces every conformance case (RFC 4231, RFC 2202)', () => {
    expect(conformance.count).toBe(conformance.cases.length);
    for (const vector of conformance.cases) {
      expect(tagOf(bundle(run(vector.params as HmacParams, { resolve }))), vector.name).toBe(vector.outputs.tag);
    }
  });
});
