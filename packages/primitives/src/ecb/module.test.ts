import {
  chainIssues,
  ecbDecrypt,
  ecbEncrypt,
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
import { ECB_OP_NAMES, ecbManifest, validateEcbParams, type EcbParams } from './manifest.ts';
import { run } from './module.ts';

const NS = 'plugin.ecb';
const KEY = '2b7e151628aed2a6abf7158809cf4f3c';
const BLOCK = '41545441434b204154204441574e2121';
const BASE: EcbParams = { cipher: 'aes', keyHex: KEY, inputHex: BLOCK.repeat(2), direction: 'encrypt', padding: 'pkcs7' };

let resolve: PortResolver;
let aes: BlockCipher;

beforeAll(async () => {
  const registry = new Registry<PrimitiveManifest>('producers');
  primitiveManifests.forEach((manifest) => registry.register(manifest));
  resolve = await preparePorts(ecbManifest, BASE, registry);
  aes = resolve('BlockCipher', 'aes')!;
});

function bundle(result: RunResult): TraceBundle {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.key}`);
  return result.trace;
}

const runWith = (overrides: Partial<EcbParams>) => run({ ...BASE, ...overrides }, { resolve });
const hexOut = (trace: TraceBundle, name: string) => toHex(trace.output[name] ?? []);
const stateOf = (trace: TraceBundle) => getFacet<AnyStateFacet>(trace, 'state')!;
const key = parseHexOrThrow(KEY);

describe('ecb run: encrypt', () => {
  it('equals the core reference over the PKCS#7-padded input', () => {
    const trace = bundle(runWith({}));
    expect(hexOut(trace, 'ciphertext')).toBe(toHex(ecbEncrypt(aes, key, pkcs7Pad(parseHexOrThrow(BASE.inputHex), 16))));
    expect(Object.keys(trace.output)).toEqual(['ciphertext']);
  });

  it('shows the repetition: equal plaintext blocks give equal ciphertext blocks', () => {
    const ciphertext = hexOut(bundle(runWith({})), 'ciphertext');
    expect(ciphertext.slice(0, 32)).toBe(ciphertext.slice(32, 64));
  });

  it('records pad once at top level, then encryptBlock → emit per block, scoped block → op', () => {
    const steps = stateOf(bundle(runWith({}))).steps;
    expect(steps.map((step) => step.op)).toEqual(['pad', 'encryptBlock', 'emit', 'encryptBlock', 'emit', 'encryptBlock', 'emit']);
    expect(steps.map((step) => step.scope)).toEqual([[], [0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]]);
    expect(steps.every((step) => (ECB_OP_NAMES as readonly string[]).includes(step.op))).toBe(true);
  });

  it('narrates the initial state and labels the scope levels', () => {
    const state = stateOf(bundle(runWith({})));
    expect(state.initialNarration).toEqual({ key: `${NS}.step.initialEncrypt`, params: { bytes: 32, blockSize: 16, cipher: 'AES' } });
    expect(state.scopeLevels?.map((level) => level.labelKey)).toEqual([`${NS}.scope.block`, `${NS}.scope.op`]);
  });

  it('draws independent lanes whose cipher nodes zoom into the cipher lab', () => {
    const trace = bundle(runWith({}));
    const chain = getFacet<ChainFacet>(trace, 'chain')!;
    expect(chainIssues(chain, stateOf(trace).steps.length)).toEqual([]);
    expect(chain).toMatchObject({ mode: 'ecb', direction: 'encrypt', formula: { key: `${NS}.formula.encrypt` } });
    expect(chain.nodes.find((node) => node.id === 'b1.cipher')?.zoom).toEqual({ producerId: 'aes', keyHex: KEY, blockHex: BLOCK });
    expect(chain.edges).toContainEqual({ from: 'pad', to: 'b2.input', activeAt: 0 });
    expect(chain.edges.filter((edge) => edge.to === 'b1.cipher')).toEqual([{ from: 'b1.input', to: 'b1.cipher', activeAt: 3 }]);
  });

  it('puts the ciphertext blocks on the wire, each lit when emitted', () => {
    const trace = bundle(runWith({}));
    const wire = getFacet<WireFacet>(trace, 'wire')!;
    expect(wireIssues(wire, stateOf(trace).steps.length)).toEqual([]);
    expect(wire.segments.map((segment) => segment.id)).toEqual(['c0', 'c1', 'c2']);
    expect(wire.activeAt?.map((entry) => entry.step)).toEqual([2, 4, 6]);
    expect(wire.segments.map((segment) => segment.availableAt)).toEqual([2, 4, 6]);
  });

  it('links every sent output node to its wire segment, available when the node gets its value', () => {
    const trace = bundle(runWith({}));
    const segments = getFacet<WireFacet>(trace, 'wire')!.segments;
    const outputs = getFacet<ChainFacet>(trace, 'chain')!.nodes.filter((node) => node.kind === 'output');
    expect(outputs.map((node) => [node.segmentId, node.activeAt])).toEqual(outputs.map((node) => [`c${node.block}`, segments.find((segment) => segment.id === node.segmentId)?.availableAt]));
  });

  it('declares key, plaintext and ciphertext values', () => {
    const values = getFacet<ValuesFacet>(bundle(runWith({})), 'values')!.values;
    expect(values.map((value) => [value.id, value.role, value.createdAt])).toEqual([
      ['key', 'key', -1],
      ['plaintext', 'plaintext', -1],
      ['ciphertext', 'ciphertext', 6],
    ]);
  });
});

describe('ecb run: decrypt', () => {
  it('recovers the plaintext and strips valid padding', () => {
    const input = toHex(ecbEncrypt(aes, key, pkcs7Pad(parseHexOrThrow(BLOCK + '01'), 16)));
    const trace = bundle(runWith({ inputHex: input, direction: 'decrypt' }));
    expect(hexOut(trace, 'plaintext')).toBe(BLOCK + '01');
    expect(stateOf(trace).steps.map((step) => step.op)).toEqual(['decryptBlock', 'emit', 'decryptBlock', 'emit', 'unpad']);
    expect(stateOf(trace).initialNarration).toEqual({ key: `${NS}.step.initialDecrypt`, params: { bytes: 32, count: 2, cipher: 'AES' } });
    expect(getFacet<WireFacet>(trace, 'wire')!.segments.map((segment) => segment.availableAt)).toEqual([undefined, undefined]);
    const chain = getFacet<ChainFacet>(trace, 'chain')!;
    expect(chain.nodes.some((node) => node.zoom !== undefined)).toBe(false);
    expect(chain.nodes.find((node) => node.id === 'unpad')?.label.key).toBe(`${NS}.chain.unpad`);
  });

  it('narrates invalid padding as the last step and outputs `padded` instead of failing', () => {
    const input = BLOCK.repeat(2);
    const trace = bundle(runWith({ inputHex: input, direction: 'decrypt' }));
    expect(Object.keys(trace.output)).toEqual(['padded']);
    expect(hexOut(trace, 'padded')).toBe(toHex(ecbDecrypt(aes, key, parseHexOrThrow(input))));
    expect(stateOf(trace).steps.at(-1)?.narration.key).toMatch(new RegExp(`^${NS}\\.step\\.unpadInvalid\\.`));
  });

  it('lights each received block on the wire when it is deciphered', () => {
    const trace = bundle(runWith({ inputHex: BLOCK.repeat(2), direction: 'decrypt', padding: 'none' }));
    const wire = getFacet<WireFacet>(trace, 'wire')!;
    expect(wire.activeAt).toEqual([
      { step: 0, offsets: Array.from({ length: 16 }, (_, i) => i) },
      { step: 2, offsets: Array.from({ length: 16 }, (_, i) => 16 + i) },
    ]);
  });
});

describe('ecb run errors', () => {
  it.each([
    [{ cipher: 'nope' }, { key: 'core.error.portMissing', params: { id: 'nope' } }],
    [{ keyHex: '00'.repeat(15) }, { key: 'core.error.keyLength', params: { sizes: '16, 24, 32' } }],
    [{ padding: 'none' as const, inputHex: '00'.repeat(17) }, { key: `${NS}.error.notAligned`, params: { blockSize: 16, length: 17 } }],
    [{ direction: 'decrypt' as const, inputHex: '00'.repeat(17) }, { key: `${NS}.error.notAligned`, params: { blockSize: 16, length: 17 } }],
  ])('%j → run error', (overrides, error) => {
    expect(runWith(overrides)).toEqual({ ok: false, error });
  });
});

describe('ecb presets and conformance vectors', () => {
  it('the decrypt preset is the encryption of the teaching preset', () => {
    const [encrypt, decrypt] = ecbManifest.presets;
    expect(decrypt?.params.inputHex).toBe(hexOut(bundle(run(encrypt!.params, { resolve })), 'ciphertext'));
    expect(hexOut(bundle(run(decrypt!.params, { resolve })), 'plaintext')).toBe(encrypt?.params.inputHex);
  });

  it('match the core reference (SP 800-38A F.1)', () => {
    for (const vector of conformance.cases) {
      const params = vector.params as EcbParams;
      const reference = params.direction === 'encrypt' ? ecbEncrypt : ecbDecrypt;
      const [name, hex] = Object.entries(vector.outputs)[0]!;
      expect(toHex(reference(aes, parseHexOrThrow(params.keyHex), parseHexOrThrow(params.inputHex))), vector.name).toBe(hex);
      expect(hexOut(bundle(run(params, { resolve })), name), vector.name).toBe(hex);
    }
  });
});

describe('validateEcbParams', () => {
  it('normalises hex', () => {
    expect(validateEcbParams({ ...BASE, keyHex: KEY.toUpperCase() })).toEqual({ ok: true, value: BASE });
  });

  it.each([
    [null, { key: `${NS}.error.invalidParams` }],
    [{ ...BASE, cipher: '' }, { key: `${NS}.error.cipher` }],
    [{ ...BASE, direction: 'sideways' }, { key: `${NS}.error.direction` }],
    [{ ...BASE, padding: 'zeros' }, { key: `${NS}.error.padding` }],
  ])('rejects %j', (params, error) => {
    expect(validateEcbParams(params)).toEqual({ ok: false, error });
  });
});
