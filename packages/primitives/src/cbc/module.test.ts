import {
  cbcDecrypt,
  cbcEncrypt,
  chainIssues,
  getFacet,
  parseHexOrThrow,
  pkcs7Pad,
  preparePorts,
  Registry,
  toHex,
  wireIssues,
  type AnyStateFacet,
  type BlockCipher,
  type ChainFacet,
  type PortResolver,
  type PrimitiveManifest,
  type RunResult,
  type TraceBundle,
  type ValuesFacet,
  type WireFacet,
} from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { beforeAll, describe, expect, it } from 'vitest';
import conformance from './vectors/conformance.json' with { type: 'json' };
import { CBC_OP_NAMES, cbcManifest, validateCbcParams, type CbcParams } from './manifest.ts';
import { run } from './module.ts';

const NS = 'plugin.cbc';
const KEY = '2b7e151628aed2a6abf7158809cf4f3c';
const IV = '000102030405060708090a0b0c0d0e0f';
const BLOCK = '41545441434b204154204441574e2121';
const BASE: CbcParams = { cipher: 'aes', keyHex: KEY, ivHex: IV, inputHex: BLOCK.repeat(2), direction: 'encrypt', padding: 'pkcs7' };

let resolve: PortResolver;
let aes: BlockCipher;

beforeAll(async () => {
  const registry = new Registry<PrimitiveManifest>('producers');
  primitiveManifests.forEach((manifest) => registry.register(manifest));
  resolve = await preparePorts(cbcManifest, BASE, registry);
  aes = resolve('BlockCipher', 'aes')!;
});

function bundle(result: RunResult): TraceBundle {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.key}`);
  return result.trace;
}

const runWith = (overrides: Partial<CbcParams>) => run({ ...BASE, ...overrides }, { resolve });
const hexOut = (trace: TraceBundle, name: string) => toHex(trace.output[name] ?? []);
const stateOf = (trace: TraceBundle) => getFacet<AnyStateFacet>(trace, 'state')!;
const key = parseHexOrThrow(KEY);
const iv = parseHexOrThrow(IV);

describe('cbc run: encrypt', () => {
  it('equals the core reference over the PKCS#7-padded input', () => {
    const trace = bundle(runWith({}));
    const expected = cbcEncrypt(aes, key, iv, pkcs7Pad(parseHexOrThrow(BASE.inputHex), 16));
    expect(hexOut(trace, 'ciphertext')).toBe(toHex(expected));
    expect(Object.keys(trace.output)).toEqual(['ciphertext']);
  });

  it('hides equal plaintext blocks (C1 ≠ C2)', () => {
    const ciphertext = hexOut(bundle(runWith({})), 'ciphertext');
    expect(ciphertext.slice(0, 32)).not.toBe(ciphertext.slice(32, 64));
  });

  it('records pad once, then xorChain → encryptBlock → emit per block, scoped block → op', () => {
    const steps = stateOf(bundle(runWith({}))).steps;
    expect(steps.map((step) => step.op)).toEqual(['pad', ...Array(3).fill(['xorChain', 'encryptBlock', 'emit']).flat()]);
    expect(steps.map((step) => step.scope)).toEqual([[], [0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]]);
    expect(steps.every((step) => (CBC_OP_NAMES as readonly string[]).includes(step.op))).toBe(true);
  });

  it('narrates the initial state and labels the scope levels', () => {
    const state = stateOf(bundle(runWith({})));
    expect(state.initialNarration).toEqual({ key: `${NS}.step.initialEncrypt`, params: { bytes: 32, blockSize: 16, cipher: 'AES' } });
    expect(state.scopeLevels?.map((level) => level.labelKey)).toEqual([`${NS}.scope.block`, `${NS}.scope.op`]);
  });

  it('draws one lane per block; encryption nodes zoom into the cipher lab', () => {
    const trace = bundle(runWith({}));
    const chain = getFacet<ChainFacet>(trace, 'chain')!;
    expect(chainIssues(chain, stateOf(trace).steps.length)).toEqual([]);
    expect(chain).toMatchObject({ mode: 'cbc', direction: 'encrypt', formula: { key: `${NS}.formula.encrypt` } });
    const cipher0 = chain.nodes.find((node) => node.id === 'b0.cipher');
    expect(cipher0?.zoom).toEqual({ producerId: 'aes', params: { keyHex: KEY, plaintextHex: toHex(parseHexOrThrow(BLOCK).map((b, i) => b ^ (iv[i] ?? 0))), detail: 'op' } });
    expect(chain.edges).toContainEqual({ from: 'iv', to: 'b0.xor', activeAt: 1 });
    expect(chain.edges).toContainEqual({ from: 'b0.output', to: 'b1.xor', activeAt: 4 });
    expect(chain.edges).toContainEqual({ from: 'pad', to: 'b2.input', activeAt: 0 });
  });

  it('puts the IV and the ciphertext blocks on the wire, each lit when emitted', () => {
    const trace = bundle(runWith({}));
    const wire = getFacet<WireFacet>(trace, 'wire')!;
    expect(wireIssues(wire, stateOf(trace).steps.length)).toEqual([]);
    expect(wire.segments.map((segment) => [segment.id, segment.role])).toEqual([['iv', 'iv'], ['c0', 'ciphertext'], ['c1', 'ciphertext'], ['c2', 'ciphertext']]);
    expect(wire.activeAt?.map((entry) => entry.step)).toEqual([-1, 3, 6, 9]);
    expect(wire.segments.map((segment) => segment.availableAt)).toEqual([undefined, 3, 6, 9]);
    expect(wire.flip).toBeUndefined();
  });

  it('zooms with the params the cipher provides, and not at all without labParams', () => {
    const { labParams: _, ...plainCipher } = aes;
    const trace = bundle(run(BASE, { resolve: (() => plainCipher) as unknown as PortResolver }));
    expect(getFacet<ChainFacet>(trace, 'chain')!.nodes.some((node) => node.zoom !== undefined)).toBe(false);
  });

  it('declares key, IV, plaintext and ciphertext values', () => {
    const values = getFacet<ValuesFacet>(bundle(runWith({})), 'values')!.values;
    expect(values.map((value) => [value.id, value.role, value.createdAt])).toEqual([
      ['key', 'key', -1],
      ['iv', 'nonce', -1],
      ['plaintext', 'plaintext', -1],
      ['ciphertext', 'ciphertext', 9],
    ]);
  });
});

describe('cbc run: decrypt', () => {
  const ciphertext = () => toHex(cbcEncrypt(aes, key, iv, pkcs7Pad(parseHexOrThrow(BLOCK + '01'), 16)));

  it('recovers the plaintext and strips valid padding', () => {
    const trace = bundle(runWith({ inputHex: ciphertext(), direction: 'decrypt' }));
    expect(hexOut(trace, 'plaintext')).toBe(BLOCK + '01');
    const steps = stateOf(trace).steps;
    expect(steps.map((step) => step.op)).toEqual(['decryptBlock', 'xorChain', 'emit', 'decryptBlock', 'xorChain', 'emit', 'unpad']);
    expect(steps.at(-1)?.narration).toEqual({ key: `${NS}.step.unpad`, params: { count: 15, byte: '0f', length: 17 } });
    expect(stateOf(trace).initialNarration).toEqual({ key: `${NS}.step.initialDecrypt`, params: { bytes: 32, count: 2, cipher: 'AES' } });
    expect(getFacet<WireFacet>(trace, 'wire')!.segments.map((segment) => segment.availableAt)).toEqual([undefined, undefined, undefined]);
  });

  it('narrates invalid padding as the last step and outputs `padded` instead of failing', () => {
    const input = BLOCK.repeat(2);
    const trace = bundle(runWith({ inputHex: input, direction: 'decrypt' }));
    const padded = cbcDecrypt(aes, key, iv, parseHexOrThrow(input));
    expect(Object.keys(trace.output)).toEqual(['padded']);
    expect(hexOut(trace, 'padded')).toBe(toHex(padded));
    const last = stateOf(trace).steps.at(-1);
    expect(last?.op).toBe('unpad');
    expect(last?.narration.key).toMatch(new RegExp(`^${NS}\\.step\\.unpadInvalid\\.`));
    const chain = getFacet<ChainFacet>(trace, 'chain')!;
    expect(chain.nodes.find((node) => node.id === 'unpad')?.label.key).toBe(`${NS}.chain.unpadInvalid`);
  });

  it('decrypts without padding and never zooms (the cipher lab encrypts)', () => {
    const input = BLOCK.repeat(2);
    const trace = bundle(runWith({ inputHex: input, direction: 'decrypt', padding: 'none' }));
    expect(hexOut(trace, 'plaintext')).toBe(toHex(cbcDecrypt(aes, key, iv, parseHexOrThrow(input))));
    const chain = getFacet<ChainFacet>(trace, 'chain')!;
    expect(chain.nodes.some((node) => node.zoom !== undefined)).toBe(false);
    expect(chainIssues(chain, stateOf(trace).steps.length)).toEqual([]);
    expect(chain.edges).toContainEqual({ from: 'b0.input', to: 'b1.xor', activeAt: 4 });
    const wire = getFacet<WireFacet>(trace, 'wire')!;
    expect(wireIssues(wire, stateOf(trace).steps.length)).toEqual([]);
  });
});

describe('cbc run errors', () => {
  it.each([
    [{ cipher: 'nope' }, { key: 'core.error.portMissing', params: { id: 'nope' } }],
    [{ keyHex: '00'.repeat(15) }, { key: 'core.error.keyLength', params: { sizes: '16, 24, 32' } }],
    [{ ivHex: '00'.repeat(8) }, { key: `${NS}.error.ivBlockSize`, params: { blockSize: 16, length: 8 } }],
    [{ padding: 'none' as const, inputHex: '00'.repeat(17) }, { key: `${NS}.error.notAligned`, params: { blockSize: 16, length: 17 } }],
    [{ direction: 'decrypt' as const, inputHex: '00'.repeat(17) }, { key: `${NS}.error.notAligned`, params: { blockSize: 16, length: 17 } }],
  ])('%j → run error', (overrides, error) => {
    expect(runWith(overrides)).toEqual({ ok: false, error });
  });

  it('reports a missing resolver as a missing port', () => {
    expect(run(BASE)).toEqual({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'aes' } } });
  });
});

describe('cbc presets and conformance vectors', () => {
  it('the decrypt preset is the encryption of the teaching preset', () => {
    const [encrypt, decrypt] = cbcManifest.presets;
    expect(decrypt?.params.inputHex).toBe(hexOut(bundle(run(encrypt!.params, { resolve })), 'ciphertext'));
    expect(hexOut(bundle(run(decrypt!.params, { resolve })), 'plaintext')).toBe(encrypt?.params.inputHex);
  });

  it('match the core reference (SP 800-38A F.2)', () => {
    for (const vector of conformance.cases) {
      const params = vector.params as CbcParams;
      const reference = params.direction === 'encrypt' ? cbcEncrypt : cbcDecrypt;
      const expected = reference(aes, parseHexOrThrow(params.keyHex), parseHexOrThrow(params.ivHex), parseHexOrThrow(params.inputHex));
      const [name, hex] = Object.entries(vector.outputs)[0]!;
      expect(toHex(expected), vector.name).toBe(hex);
      expect(hexOut(bundle(run(params, { resolve })), name), vector.name).toBe(hex);
    }
  });
});

describe('validateCbcParams', () => {
  it('normalises hex', () => {
    expect(validateCbcParams({ ...BASE, keyHex: KEY.toUpperCase() })).toEqual({ ok: true, value: BASE });
  });

  it.each([
    [null, { key: `${NS}.error.invalidParams` }],
    [{ ...BASE, ivHex: '' }, { key: `${NS}.error.ivLength`, params: { length: 0 } }],
    [{ ...BASE, direction: 'sideways' }, { key: `${NS}.error.direction` }],
    [{ ...BASE, padding: 'zeros' }, { key: `${NS}.error.padding` }],
    [{ ...BASE, inputHex: '00'.repeat(65) }, { key: `${NS}.error.inputLength`, params: { length: 65 } }],
  ])('rejects %j', (params, error) => {
    expect(validateCbcParams(params)).toEqual({ ok: false, error });
  });

  it('accepts every preset', () => {
    for (const preset of cbcManifest.presets) expect(validateCbcParams(preset.params).ok).toBe(true);
  });
});
