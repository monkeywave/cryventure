import {
  chainIssues,
  ctrXor,
  getFacet,
  parseHexOrThrow,
  preparePorts,
  Registry,
  toHex,
  wireIssues,
  xorBytes,
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
import { CTR_OP_NAMES, ctrManifest, validateCtrParams, type CtrParams } from './manifest.ts';
import { run } from './module.ts';

const NS = 'plugin.ctr';
const KEY = '2b7e151628aed2a6abf7158809cf4f3c';
const COUNTER = 'f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff';
const MESSAGE = '435452206e65656473206e6f2070616464696e67';
const BASE: CtrParams = { cipher: 'aes', keyHex: KEY, counterHex: COUNTER, inputHex: MESSAGE };

let resolve: PortResolver;
let aes: BlockCipher;

beforeAll(async () => {
  const registry = new Registry<PrimitiveManifest>('producers');
  primitiveManifests.forEach((manifest) => registry.register(manifest));
  resolve = await preparePorts(ctrManifest, BASE, registry);
  aes = resolve('BlockCipher', 'aes')!;
});

function bundle(result: RunResult): TraceBundle {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.key}`);
  return result.trace;
}

const runWith = (overrides: Partial<CtrParams>) => run({ ...BASE, ...overrides }, { resolve });
const hexOut = (trace: TraceBundle, name: string) => toHex(trace.output[name] ?? []);
const stateOf = (trace: TraceBundle) => getFacet<AnyStateFacet>(trace, 'state')!;
const key = parseHexOrThrow(KEY);

describe('ctr run', () => {
  it('equals the core reference for a message that is not block-aligned, and outputs the used keystream', () => {
    const trace = bundle(runWith({}));
    const expected = ctrXor(aes, key, parseHexOrThrow(COUNTER), parseHexOrThrow(MESSAGE));
    expect(hexOut(trace, 'output')).toBe(toHex(expected));
    expect(hexOut(trace, 'keystream')).toBe(toHex(xorBytes(expected, parseHexOrThrow(MESSAGE))));
    expect(trace.output['keystream']).toHaveLength(20);
  });

  it('is its own inverse', () => {
    const ciphertext = hexOut(bundle(runWith({})), 'output');
    expect(hexOut(bundle(runWith({ inputHex: ciphertext })), 'output')).toBe(MESSAGE);
  });

  it('records encryptBlock → xorKeystream, incrementing the counter from the second block on', () => {
    const steps = stateOf(bundle(runWith({}))).steps;
    expect(steps.map((step) => step.op)).toEqual(['encryptBlock', 'xorKeystream', 'incrementCounter', 'encryptBlock', 'xorKeystream']);
    expect(steps.map((step) => step.scope)).toEqual([[0, 0], [0, 1], [1, 0], [1, 1], [1, 2]]);
    expect(steps.every((step) => (CTR_OP_NAMES as readonly string[]).includes(step.op))).toBe(true);
    expect(steps[2]?.narration).toEqual({ key: `${NS}.step.incrementCounter`, params: { n: 2, prev: 1, counter: 'f0f1f2f3f4f5f6f7f8f9fafbfcfdff00' } });
    expect(steps[4]?.narration.key).toBe(`${NS}.step.xorKeystreamPartial`);
    expect(steps[4]?.narration.params).toMatchObject({ used: 4, unused: 12 });
  });

  it('narrates the initial state and labels the scope levels', () => {
    const state = stateOf(bundle(runWith({})));
    expect(state.initialNarration).toEqual({ key: `${NS}.step.initial`, params: { bytes: 20, blocks: 2, blockSize: 16, cipher: 'AES', counter: COUNTER } });
    expect(state.scopeLevels?.map((level) => level.labelKey)).toEqual([`${NS}.scope.block`, `${NS}.scope.op`]);
  });

  it('draws counter → E_K → keystream ⊕ input lanes; every E_K zooms into the cipher lab', () => {
    const trace = bundle(runWith({}));
    const chain = getFacet<ChainFacet>(trace, 'chain')!;
    expect(chainIssues(chain, stateOf(trace).steps.length)).toEqual([]);
    expect(chain).toMatchObject({ mode: 'ctr', direction: 'encrypt', formula: { key: `${NS}.formula.encrypt` } });
    expect(chain.nodes.filter((node) => node.kind === 'cipher').map((node) => node.zoom?.params['plaintextHex'])).toEqual([COUNTER, 'f0f1f2f3f4f5f6f7f8f9fafbfcfdff00']);
    expect(chain.edges).toContainEqual({ from: 'b0.counter', to: 'b1.counter', activeAt: 2 });
    expect(chain.nodes.find((node) => node.id === 'b1.keystream')?.bytes).toHaveLength(4);
  });

  it('puts the nonce and the output blocks on the wire', () => {
    const trace = bundle(runWith({}));
    const wire = getFacet<WireFacet>(trace, 'wire')!;
    expect(wireIssues(wire, stateOf(trace).steps.length)).toEqual([]);
    expect(wire.segments.map((segment) => [segment.id, segment.role, segment.bytes.length])).toEqual([['nonce', 'nonce', 16], ['c0', 'ciphertext', 16], ['c1', 'ciphertext', 4]]);
    expect(wire.activeAt?.map((entry) => entry.step)).toEqual([-1, 1, 4]);
  });

  it('declares key, counter, input, keystream and output values', () => {
    const values = getFacet<ValuesFacet>(bundle(runWith({})), 'values')!.values;
    expect(values.map((value) => [value.id, value.role, value.createdAt])).toEqual([
      ['key', 'key', -1],
      ['counter', 'nonce', -1],
      ['input', 'plaintext', -1],
      ['keystream', 'secret', 4],
      ['output', 'ciphertext', 4],
    ]);
  });

  it.each([
    [{ cipher: 'nope' }, { key: 'core.error.portMissing', params: { id: 'nope' } }],
    [{ keyHex: '00'.repeat(15) }, { key: 'core.error.keyLength', params: { sizes: '16, 24, 32' } }],
    [{ counterHex: '00'.repeat(8) }, { key: `${NS}.error.counterBlockSize`, params: { blockSize: 16, length: 8 } }],
  ])('%j → run error', (overrides, error) => {
    expect(runWith(overrides)).toEqual({ ok: false, error });
  });
});

describe('ctr conformance vectors', () => {
  it('match the core reference (SP 800-38A F.5)', () => {
    for (const vector of conformance.cases) {
      const params = vector.params as CtrParams;
      const expected = ctrXor(aes, parseHexOrThrow(params.keyHex), parseHexOrThrow(params.counterHex), parseHexOrThrow(params.inputHex));
      expect(toHex(expected), vector.name).toBe(vector.outputs.output);
      expect(hexOut(bundle(run(params, { resolve })), 'output'), vector.name).toBe(vector.outputs.output);
    }
  });
});

describe('validateCtrParams', () => {
  it('normalises hex', () => {
    expect(validateCtrParams({ ...BASE, counterHex: COUNTER.toUpperCase() })).toEqual({ ok: true, value: BASE });
  });

  it.each([
    [null, { key: `${NS}.error.invalidParams` }],
    [{ ...BASE, counterHex: '' }, { key: `${NS}.error.counterLength`, params: { length: 0 } }],
    [{ ...BASE, inputHex: '00'.repeat(65) }, { key: `${NS}.error.inputLength`, params: { length: 65 } }],
  ])('rejects %j', (params, error) => {
    expect(validateCtrParams(params)).toEqual({ ok: false, error });
  });
});
