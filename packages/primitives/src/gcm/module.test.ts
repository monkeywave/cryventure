import {
  gcmDecrypt,
  gcmEncrypt,
  getFacet,
  parseHexOrThrow,
  preparePorts,
  Registry,
  toHex,
  type AnyStateFacet,
  type BlockCipher,
  type FieldFacet,
  type PortResolver,
  type PrimitiveManifest,
  type RunResult,
  type TraceBundle,
} from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { beforeAll, describe, expect, it } from 'vitest';
import conformance from './vectors/conformance.json' with { type: 'json' };
import { recordGcm } from './gcmTrace.ts';
import { byteLengths, GCM_OP_NAMES, GCM_PRESETS, gcmManifest, validateGcmParams, type GcmParams } from './manifest.ts';
import { assertMatchesGcmReference, gcmOutputs, resolveGcmCipher, run } from './module.ts';

const NS = 'plugin.gcm';
const TC4_TAG = '5bc94fbc3221a5db94fae95ae7121a47';
const BASE = GCM_PRESETS[1]!.params;

let resolve: PortResolver;
let aes: BlockCipher;

beforeAll(async () => {
  const registry = new Registry<PrimitiveManifest>('producers');
  primitiveManifests.forEach((manifest) => registry.register(manifest));
  resolve = await preparePorts(gcmManifest, BASE, registry);
  aes = resolve('BlockCipher', 'aes')!;
});

function bundle(result: RunResult): TraceBundle {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.key}`);
  return result.trace;
}

const runWith = (overrides: Partial<GcmParams>) => run({ ...BASE, ...overrides }, { resolve });
const hexOutputs = (trace: TraceBundle) => Object.fromEntries(Object.entries(trace.output).map(([name, bytes]) => [name, toHex(bytes)]));
const presetParams = (id: string) => GCM_PRESETS.find((preset) => preset.id === id)!.params;
const runPreset = (id: string) => bundle(run(presetParams(id), { resolve }));

/** A 128-bit toy cipher (E = XOR with the key), to reach the run errors the AES port never triggers. */
const toyCipher = (blockSize: number): BlockCipher => ({
  id: 'toy',
  blockSize,
  keySizes: [16],
  encryptBlock: (key, block) => block.map((byte, index) => byte ^ (key[index] ?? 0)),
  decryptBlock: (key, block) => block.map((byte, index) => byte ^ (key[index] ?? 0)),
});
const resolverOf = (cipher: BlockCipher): PortResolver => ((port: string, id: string) => (port === 'BlockCipher' && id === cipher.id ? cipher : undefined)) as PortResolver;

describe('gcm presets', () => {
  it('TC 2 matches McGrew–Viega, and its GHASH S is the published value', () => {
    const trace = runPreset('mcgrew-viega-tc2');
    expect(hexOutputs(trace)).toEqual({ ciphertext: '0388dace60b6a392f328c2b971b2fe78', tag: 'ab6e47d42cec13bdf53a67b21257bddf' });
    const field = getFacet<FieldFacet>(trace, 'field')!;
    expect(toHex(field.steps.at(-1)!.terms[2]!.bytes)).toBe('f38cbb1ad69223dcc3457ae5b6b0f885');
  });

  it('TC 6 forms J0 through GHASH and still matches the published tag', () => {
    expect(hexOutputs(runPreset('mcgrew-viega-tc6')).tag).toBe('619cc5aefffe0bfa462af43c1699d050');
    expect(getFacet<FieldFacet>(runPreset('mcgrew-viega-tc6'), 'field')!.steps.length).toBe(1 + 5 + 7);
  });

  it('GMAC outputs an empty ciphertext and a tag over the AAD only', () => {
    const expected = gcmEncrypt(aes, parseHexOrThrow(BASE.keyHex), parseHexOrThrow(BASE.ivHex), parseHexOrThrow(BASE.aadHex), new Uint8Array(), 16);
    expect(hexOutputs(runPreset('gmac'))).toEqual({ ciphertext: '', tag: toHex(expected.tag) });
  });

  it('truncates the tag to 96 bits', () => {
    expect(hexOutputs(runPreset('truncated-tag'))).toMatchObject({ tag: TC4_TAG.slice(0, 24) });
  });

  it('decrypts with a valid tag and outputs nothing (FAIL) with a flipped tag bit', () => {
    expect(hexOutputs(runPreset('decrypt-valid'))).toEqual({ plaintext: GCM_PRESETS[1]!.params.inputHex });
    const trace = runPreset('decrypt-forged');
    expect(trace.output).toEqual({});
    expect(getFacet<AnyStateFacet>(trace, 'state')!.steps.at(-1)?.narration.key).toBe(`${NS}.step.verifyFail`);
  });
});

describe('gcm run', () => {
  it('records only declared ops and labels the scope levels phase → op', () => {
    const state = getFacet<AnyStateFacet>(bundle(runWith({})), 'state')!;
    expect(state.steps.every((step) => (GCM_OP_NAMES as readonly string[]).includes(step.op))).toBe(true);
    expect(state.scopeLevels?.map((level) => level.labelKey)).toEqual([`${NS}.scope.phase`, `${NS}.scope.op`]);
  });

  it('emits every declared facet', () => {
    const trace = bundle(runWith({}));
    for (const kind of gcmManifest.facets) expect(getFacet(trace, kind), kind).toBeDefined();
  });

  it.each([
    [{ cipher: 'nope' }, { key: 'core.error.portMissing', params: { id: 'nope' } }],
    [{ keyHex: '00'.repeat(15) }, { key: 'core.error.keyLength', params: { sizes: '16, 24, 32' } }],
  ])('%j → run error', (overrides, error) => {
    expect(runWith(overrides)).toEqual({ ok: false, error });
  });

  it('rejects a block cipher whose blocks are not 16 bytes', () => {
    const toy = toyCipher(8);
    expect(run({ ...BASE, cipher: 'toy' }, { resolve: resolverOf(toy) })).toEqual({ ok: false, error: { key: `${NS}.error.blockSize`, params: { blockSize: 8 } } });
  });
});

describe('resolveGcmCipher', () => {
  it('returns the cipher and the decoded key', () => {
    const resolved = resolveGcmCipher({ resolve }, BASE);
    expect(resolved.ok && toHex(resolved.key)).toBe(BASE.keyHex);
  });

  it('checks the block size before the key size', () => {
    const result = resolveGcmCipher({ resolve: resolverOf(toyCipher(8)) }, { cipher: 'toy', keyHex: '00' });
    expect(result).toEqual({ ok: false, error: { key: `${NS}.error.blockSize`, params: { blockSize: 8 } } });
  });

  it('reports a missing resolver as a missing port', () => {
    expect(resolveGcmCipher({}, BASE)).toEqual({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'aes' } } });
  });
});

describe('gcmOutputs and assertMatchesGcmReference', () => {
  const tc4Run = () => ({
    cipher: aes,
    key: parseHexOrThrow(BASE.keyHex),
    iv: Array.from(parseHexOrThrow(BASE.ivHex)),
    aad: Array.from(parseHexOrThrow(BASE.aadHex)),
    input: Array.from(parseHexOrThrow(BASE.inputHex)),
    direction: 'encrypt' as const,
    tagBytes: 16,
    receivedTag: [],
  });

  it('names the outputs per direction and withholds the plaintext on FAIL', () => {
    expect(Object.keys(gcmOutputs(recordGcm(tc4Run())))).toEqual(['ciphertext', 'tag']);
    const forged = recordGcm({ ...tc4Run(), direction: 'decrypt', receivedTag: new Array<number>(16).fill(0) });
    expect(gcmOutputs(forged)).toEqual({});
  });

  it('accepts a faithful recording and throws for a tampered one', () => {
    const recording = recordGcm(tc4Run());
    expect(() => assertMatchesGcmReference(recording)).not.toThrow();
    expect(() => assertMatchesGcmReference({ ...recording, tag: recording.tag.map((byte) => byte ^ 1) })).toThrow(/tag/);
    const decrypting = recordGcm({ ...tc4Run(), direction: 'decrypt', receivedTag: new Array<number>(16).fill(0) });
    expect(() => assertMatchesGcmReference({ ...decrypting, verify: { step: 0, authentic: true } })).toThrow(/verify/);
  });
});

describe('gcm conformance vectors', () => {
  it('match the core reference (McGrew–Viega TC 1–18, both directions)', () => {
    expect(conformance.cases).toHaveLength(36);
    for (const vector of conformance.cases) {
      const params = vector.params as GcmParams;
      const [key, iv, aad, input] = [params.keyHex, params.ivHex, params.aadHex, params.inputHex].map(parseHexOrThrow) as [Uint8Array, Uint8Array, Uint8Array, Uint8Array];
      if (params.direction === 'encrypt') {
        const expected = gcmEncrypt(aes, key, iv, aad, input, 16);
        expect({ ciphertext: toHex(expected.ciphertext), tag: toHex(expected.tag) }, vector.name).toEqual(vector.outputs);
      } else {
        const expected = gcmDecrypt(aes, key, iv, aad, input, parseHexOrThrow(params.tagHex));
        expect(expected.ok && toHex(expected.plaintext), vector.name).toBe((vector.outputs as { plaintext: string }).plaintext);
      }
      expect(hexOutputs(bundle(run(params, { resolve }))), vector.name).toEqual(vector.outputs);
    }
  });
});

describe('validateGcmParams', () => {
  it('normalises hex and accepts a numeric tag length', () => {
    expect(validateGcmParams({ ...BASE, keyHex: BASE.keyHex.toUpperCase(), tagBytes: 16 })).toEqual({ ok: true, value: BASE });
  });

  it.each([['00'.repeat(17)], ['not hex'], [7], [undefined]])('ignores the tag param %j when encrypting', (tagHex) => {
    expect(validateGcmParams({ ...BASE, direction: 'encrypt', tagHex })).toEqual({ ok: true, value: { ...BASE, direction: 'encrypt', tagHex: '' } });
  });

  it('accepts empty AAD and input (GMAC)', () => {
    expect(validateGcmParams({ ...BASE, aadHex: '', inputHex: '' }).ok).toBe(true);
  });

  it.each([
    [null, { key: `${NS}.error.invalidParams` }],
    [{ ...BASE, cipher: 'Not An Id' }, { key: `${NS}.error.cipher` }],
    [{ ...BASE, ivHex: '' }, { key: `${NS}.error.ivLength`, params: { length: 0 } }],
    [{ ...BASE, aadHex: '00'.repeat(65) }, { key: `${NS}.error.aadLength`, params: { length: 65 } }],
    [{ ...BASE, inputHex: '00'.repeat(65) }, { key: `${NS}.error.inputLength`, params: { length: 65 } }],
    [{ ...BASE, direction: 'sideways' }, { key: `${NS}.error.direction` }],
    [{ ...BASE, tagBytes: '11' }, { key: `${NS}.error.tagBytes` }],
    [{ ...BASE, direction: 'decrypt', tagHex: TC4_TAG.slice(0, 24) }, { key: `${NS}.error.tagLength`, params: { length: 12, tagBytes: 16 } }],
    [{ ...BASE, direction: 'decrypt', tagHex: '00'.repeat(17) }, { key: `${NS}.error.tagLength`, params: { length: 17, tagBytes: 16 } }],
    [{ ...BASE, direction: 'decrypt', tagHex: 7 }, { key: `${NS}.error.invalidParams` }],
  ])('rejects %j', (params, error) => {
    expect(validateGcmParams(params)).toEqual({ ok: false, error });
  });
});

describe('byteLengths', () => {
  it('lists min..max inclusive', () => {
    expect(byteLengths(0, 3)).toEqual([0, 1, 2, 3]);
    expect(byteLengths(1, 1)).toEqual([1]);
  });
});
