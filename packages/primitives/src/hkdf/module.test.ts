import {
  assertTopologicalOrder,
  getFacet,
  isResultNode,
  toHex,
  validateDerivationFacet,
  type AnyStateFacet,
  type DerivationFacet,
  type MacFunction,
  type NarrationFacet,
  type RunResult,
  type TraceBundle,
  type ValuesFacet,
} from '@cryventure/core';
import { beforeAll, describe, expect, it } from 'vitest';
import conformance from './vectors/conformance.json' with { type: 'json' };
import { hkdfLabel } from './hkdf.ts';
import { initialNarration, macName, type HkdfRun } from './hkdfTrace.ts';
import { HKDF_OP_NAMES, hkdfManifest, type HkdfParams } from './manifest.ts';
import { run, runError, toRun } from './module.ts';
import { bytes, realMac, resolverFor } from './testPorts.ts';

const NS = 'plugin.hkdf';
const A1 = hkdfManifest.presets[0]!.params;
const preset = (id: string) => hkdfManifest.presets.find((entry) => entry.id === id)!.params;

async function runParams(params: HkdfParams): Promise<RunResult> {
  return run(params, { resolve: await resolverFor(params) });
}

async function bundle(params: HkdfParams): Promise<TraceBundle> {
  const result = await runParams(params);
  if (!result.ok) throw new Error(`expected ok, got ${result.error.key}`);
  return result.trace;
}

const stateOf = (trace: TraceBundle) => getFacet<AnyStateFacet>(trace, 'state')!;
const derivationOf = (trace: TraceBundle) => getFacet<DerivationFacet>(trace, 'derivation')!;
const valuesOf = (trace: TraceBundle) => getFacet<ValuesFacet>(trace, 'values')!.values;
const ops = (trace: TraceBundle) => stateOf(trace).steps.map((step) => step.op);
const hexOut = (trace: TraceBundle, name: string) => toHex(trace.output[name] ?? []);

let sha256: MacFunction;

beforeAll(async () => {
  sha256 = await realMac('sha256:hmac-sha-256');
});

describe('hkdf run: mode hkdf (RFC 5869 A.1)', () => {
  it('outputs PRK and OKM', async () => {
    const trace = await bundle(A1);
    expect(hexOut(trace, 'prk')).toBe(
      '077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5',
    );
    expect(hexOut(trace, 'okm')).toBe(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
    );
  });

  it('records extract, one expand per block, then output, all at the top level', async () => {
    const trace = await bundle(A1);
    expect(ops(trace)).toEqual(['extract', 'expand', 'expand', 'output']);
    expect(
      stateOf(trace).steps.every(
        (step) => step.scope.length === 0 && (HKDF_OP_NAMES as readonly string[]).includes(step.op),
      ),
    ).toBe(true);
  });

  it('lays out the regions IKM, salt, PRK, info, T and OKM; derived ones start blank', async () => {
    const regions = stateOf(await bundle(A1)).regions;
    expect(regions.map((region) => [region.id, region.shape[0], region.initial])).toEqual([
      ['ikm', 22, undefined],
      ['salt', 13, undefined],
      ['prk', 32, 'blank'],
      ['info', 10, undefined],
      ['t', 32, 'blank'],
      ['okm', 42, 'blank'],
    ]);
  });

  it('fills OKM block by block and narrates the truncation', async () => {
    const steps = stateOf(await bundle(A1)).steps;
    const okmWrites = steps.flatMap((step) =>
      step.writes
        .filter((write) => write.region === 'okm')
        .map((write) => [write.offset, write.values.length]),
    );
    expect(okmWrites).toEqual([
      [0, 32],
      [32, 10],
    ]);
    expect(steps[1]?.narration.key).toBe(`${NS}.step.expandFirst`);
    expect(steps[2]?.narration).toMatchObject({
      key: `${NS}.step.expand`,
      params: { n: 2, prev: 1, counter: '02', mac: 'HMAC-SHA-256' },
    });
    expect(steps[3]?.narration).toMatchObject({
      key: `${NS}.step.outputTruncated`,
      params: { length: 42, blocks: 2, dropped: 22 },
    });
  });

  it('narrates extract with the salt as key and the initial state with HashLen and N', async () => {
    const trace = await bundle(A1);
    expect(stateOf(trace).steps[0]?.narration).toEqual({
      key: `${NS}.step.extract`,
      params: {
        mac: 'HMAC-SHA-256',
        ikmBytes: 22,
        prk: '077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5',
        saltBytes: 13,
      },
    });
    expect(stateOf(trace).initialNarration).toEqual({
      key: `${NS}.step.initial.hkdf`,
      params: { mac: 'HMAC-SHA-256', hashLen: 32, ikmBytes: 22, length: 42, blocks: 2 },
    });
    expect(getFacet<NarrationFacet>(trace, 'narration')?.entries[0]?.step).toBe(-1);
  });

  it('declares IKM/PRK/T/OKM secret and salt/info public, created when computed', async () => {
    expect(
      valuesOf(await bundle(A1)).map((value) => [value.id, value.role, value.createdAt]),
    ).toEqual([
      ['ikm', 'secret', -1],
      ['salt', 'public', -1],
      ['info', 'public', -1],
      ['prk', 'secret', 0],
      ['1/t', 'secret', 1],
      ['2/t', 'secret', 2],
      ['okm', 'secret', 3],
    ]);
  });

  it('narrates an empty salt as HashLen zeros (A.3) and shows those zeros', async () => {
    const trace = await bundle(preset('rfc5869-a3'));
    expect(stateOf(trace).steps[0]?.narration).toMatchObject({
      key: `${NS}.step.extractZeroSalt`,
      params: { hashLen: 32 },
    });
    expect(stateOf(trace).initial['salt']).toEqual(new Array(32).fill(0));
    expect(stateOf(trace).regions.some((region) => region.id === 'info')).toBe(false);
    expect(valuesOf(trace).some((value) => value.id === 'info')).toBe(false);
  });

  it('narrates an exact multiple of HashLen without truncation', async () => {
    const steps = stateOf(await bundle({ ...A1, length: '64' })).steps;
    expect(steps.at(-1)?.narration).toEqual({
      key: `${NS}.step.output`,
      params: { length: 64, blocks: 2, okm: expect.any(String) as string },
    });
  });

  it('reads info as UTF-8 text', async () => {
    const text = await bundle({ ...A1, infoEncoding: 'utf8', info: 'ab' });
    const hex = await bundle({ ...A1, infoEncoding: 'hex', info: '6162' });
    expect(text.output).toEqual(hex.output);
  });
});

describe('hkdf run: derivation facet', () => {
  it('is valid, ordered and titled "HKDF"', async () => {
    const derivation = derivationOf(await bundle(A1));
    expect(validateDerivationFacet(derivation)).toEqual([]);
    expect(() => assertTopologicalOrder(derivation)).not.toThrow();
    expect(derivation.title).toEqual({ key: `${NS}.derivation.title` });
  });

  it('lists PRK, each T(i) and OKM as results', async () => {
    const derivation = derivationOf(await bundle(A1));
    expect(
      derivation.nodes
        .filter(isResultNode)
        .map((node) => [node.id, node.op, node.valueRef, node.step]),
    ).toEqual([
      ['prk', 'hmac', 'prk', 0],
      ['t1', 'hmac', '1/t', 1],
      ['t2', 'hmac', '2/t', 2],
      ['okm', 'truncate', 'okm', 3],
    ]);
  });

  it('chains T(i−1) ‖ info ‖ counter into each HMAC with PRK as key', async () => {
    const nodes = derivationOf(await bundle(A1)).nodes;
    const node = (id: string) => nodes.find((entry) => entry.id === id)!;
    expect(node('prk').inputs).toEqual(['ikm', 'salt']);
    expect(node('message1').inputs).toEqual(['info', 'counter1']);
    expect(node('message2').inputs).toEqual(['t1', 'info', 'counter2']);
    expect(node('t2').inputs).toEqual(['message2', 'prk']);
    expect(node('counter2')).toMatchObject({
      op: 'counter',
      bytes: [2],
      label: { key: `${NS}.node.counter`, params: { n: 2 } },
    });
    expect(node('okm').inputs).toEqual(['t1', 't2']);
  });

  it('zooms every HMAC node into the hmac lab with that call’s key and message', async () => {
    const nodes = derivationOf(await bundle(A1)).nodes;
    expect(nodes.find((node) => node.id === 'prk')?.zoom).toEqual({
      producerId: 'hmac',
      params: {
        hash: 'sha256:sha-256',
        key: A1.salt,
        encoding: 'hex',
        input: A1.ikm,
        tagLength: 'full',
        expected: '',
      },
    });
    const t2 = nodes.find((node) => node.id === 't2')!;
    const message2 = nodes.find((node) => node.id === 'message2')!;
    expect(t2.zoom?.params).toMatchObject({
      key: '077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5',
      input: toHex(message2.bytes),
    });
    expect(nodes.filter((node) => node.zoom !== undefined).map((node) => node.id)).toEqual([
      'prk',
      't1',
      't2',
    ]);
  });

  it('uses the HashLen zero salt as the zoom key when the salt is empty (A.7, SHA-1)', async () => {
    const prk = derivationOf(await bundle(preset('rfc5869-a7'))).nodes.find(
      (node) => node.id === 'prk',
    )!;
    expect(prk.zoom?.params).toMatchObject({ hash: 'sha1:sha-1', key: '00'.repeat(20) });
  });

  it('joins whole blocks with concat (no truncation)', async () => {
    expect(derivationOf(await bundle({ ...A1, length: '32' })).nodes.at(-1)).toMatchObject({
      id: 'okm',
      op: 'concat',
      inputs: ['t1'],
    });
  });
});

describe('hkdf run: mode extract', () => {
  it('outputs only PRK and records one step', async () => {
    const trace = await bundle({ ...A1, mode: 'extract' });
    expect(Object.keys(trace.output)).toEqual(['prk']);
    expect(ops(trace)).toEqual(['extract']);
    expect(stateOf(trace).regions.map((region) => region.id)).toEqual(['ikm', 'salt', 'prk']);
    expect(derivationOf(trace).nodes.map((node) => node.id)).toEqual(['ikm', 'salt', 'prk']);
    expect(stateOf(trace).initialNarration?.key).toBe(`${NS}.step.initial.extract`);
  });

  it('accepts an empty IKM (no ikm region or value)', async () => {
    const trace = await bundle({ ...A1, mode: 'extract', ikm: '' });
    expect(stateOf(trace).regions.map((region) => region.id)).toEqual(['salt', 'prk']);
    expect(valuesOf(trace).map((value) => value.id)).toEqual(['salt', 'prk']);
    expect(derivationOf(trace).nodes[0]).toEqual({
      id: 'ikm',
      label: { key: `${NS}.node.ikm` },
      bytes: [],
      op: 'input',
      inputs: [],
    });
  });
});

describe('hkdf run: mode expand', () => {
  const EXPAND: HkdfParams = {
    ...A1,
    mode: 'expand',
    prk: '077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5',
  };

  it('equals the expand half of full HKDF and outputs only OKM', async () => {
    const trace = await bundle(EXPAND);
    expect(Object.keys(trace.output)).toEqual(['okm']);
    expect(hexOut(trace, 'okm')).toBe(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
    );
    expect(ops(trace)).toEqual(['expand', 'expand', 'output']);
  });

  it('starts from the given PRK (not blank) as an input node and value', async () => {
    const trace = await bundle(EXPAND);
    expect(stateOf(trace).regions.find((region) => region.id === 'prk')?.initial).toBeUndefined();
    expect(valuesOf(trace).find((value) => value.id === 'prk')?.createdAt).toBe(-1);
    expect(derivationOf(trace).nodes[0]).toMatchObject({ id: 'prk', op: 'input', valueRef: 'prk' });
    expect(stateOf(trace).initialNarration).toEqual({
      key: `${NS}.step.initial.expand`,
      params: { mac: 'HMAC-SHA-256', hashLen: 32, prkBytes: 32, length: 42, blocks: 2 },
    });
  });
});

describe('hkdf run: mode expand-label (TLS 1.3)', () => {
  it('reproduces RFC 8448 "c hs traffic" and shows the HkdfLabel struct byte by byte', async () => {
    const trace = await bundle(preset('tls13-c-hs-traffic'));
    expect(hexOut(trace, 'okm')).toBe(
      'b3eddb126e067f35a780b3abf45e2d8f3b1a950738f52e9600746a0e27a55a21',
    );
    expect(ops(trace)).toEqual(['hkdfLabel', 'expand', 'output']);
    const labelStep = stateOf(trace).steps[0]!;
    expect(toHex(labelStep.writes[0]!.values)).toBe(
      '002012746c7331332063206873207472616666696320860c06edc07858ee8e78f0e7428c58edd6b43f2ca3e6e95f02ed063cf0e1cad8',
    );
    expect(labelStep.narration).toMatchObject({
      key: `${NS}.step.hkdfLabel`,
      params: {
        length: 32,
        lengthHex: '0020',
        labelLength: 18,
        label: 'c hs traffic',
        contextLength: 32,
      },
    });
  });

  it('reproduces RFC 8448 "derived" (context = SHA-256 of the empty string)', async () => {
    expect(hexOut(await bundle(preset('tls13-derived')), 'okm')).toBe(
      '6f2615a108c702c5678f54fc9dbab69716c076189c48250cebeac3576c3611ba',
    );
  });

  it('uses HkdfLabel as info in the HMAC messages and the derivation', async () => {
    const trace = await bundle(preset('tls13-derived'));
    const struct = hkdfLabel(32, 'derived', bytes(preset('tls13-derived').context)).bytes;
    const nodes = derivationOf(trace).nodes;
    expect(nodes.map((node) => node.id)).toEqual([
      'prk',
      'label',
      'context',
      'hkdfLabel',
      'counter1',
      'message1',
      't1',
      'okm',
    ]);
    expect(nodes.find((node) => node.id === 'hkdfLabel')).toMatchObject({
      op: 'hkdfLabel',
      inputs: ['label', 'context'],
      bytes: struct,
      step: 0,
    });
    expect(nodes.find((node) => node.id === 'message1')?.bytes).toEqual([...struct, 1]);
    expect(stateOf(trace).regions.map((region) => region.id)).toEqual([
      'prk',
      'hkdfLabel',
      't',
      'okm',
    ]);
    expect(valuesOf(trace).map((value) => value.id)).toEqual([
      'context',
      'prk',
      'hkdfLabel',
      '1/t',
      'okm',
    ]);
  });

  it('handles an empty context (no context node; narration shows a dash)', async () => {
    const trace = await bundle({ ...preset('tls13-derived'), context: '' });
    expect(derivationOf(trace).nodes.find((node) => node.id === 'hkdfLabel')?.inputs).toEqual([
      'label',
    ]);
    expect(stateOf(trace).steps[0]?.narration.params).toMatchObject({
      contextLength: 0,
      context: '—',
    });
  });

  it('drops the zoom when the HMAC message exceeds the hmac lab (long label and context)', async () => {
    const trace = await bundle({
      ...preset('tls13-derived'),
      label: 'x'.repeat(200),
      context: '00'.repeat(100),
    });
    const t1 = derivationOf(trace).nodes.find((node) => node.id === 't1')!;
    expect(t1.bytes).toHaveLength(32);
    expect(t1.zoom).toBeUndefined();
  });
});

describe('hkdf run errors', () => {
  it.each<[Partial<HkdfParams>, { key: string; params: Record<string, string | number> }]>([
    [{ mac: 'nope:hmac-sha-256' }, { key: 'core.error.portMissing', params: { id: 'nope' } }],
    [
      { mac: 'sha256:hmac-sha-999' },
      { key: 'core.error.portMemberMissing', params: { id: 'sha256:hmac-sha-999' } },
    ],
    [{ mac: 'blake2:blake2s-256' }, { key: `${NS}.error.notHmac`, params: { id: 'blake2s-256' } }],
    [
      { mode: 'expand', prk: '00'.repeat(31) },
      { key: `${NS}.error.prkTooShort`, params: { length: 31, hashLen: 32 } },
    ],
    [
      { mode: 'expand-label', prk: '' },
      { key: `${NS}.error.prkTooShort`, params: { length: 0, hashLen: 32 } },
    ],
  ])('%j → run error', async (overrides, error) => {
    expect(await runParams({ ...A1, ...overrides })).toEqual({ ok: false, error });
  });

  it('reports a missing resolver as a missing port', () => {
    expect(run(A1)).toEqual({
      ok: false,
      error: { key: 'core.error.portMissing', params: { id: 'sha256' } },
    });
  });

  it('returns validation errors before resolving', () => {
    expect(run({ ...A1, length: '0' })).toEqual({
      ok: false,
      error: { key: `${NS}.error.length` },
    });
  });
});

describe('runError and toRun', () => {
  const tinyMac = (outputSize: number): MacFunction => ({ ...sha256, outputSize });
  const base = (): HkdfRun => toRun(A1, sha256);

  it('decodes params (hex and UTF-8 info, numeric length)', () => {
    expect(base()).toMatchObject({
      mode: 'hkdf',
      length: 42,
      label: 'derived',
      context: [],
      prk: [],
    });
    expect(toRun({ ...A1, infoEncoding: 'utf8', info: 'ä' }, sha256).info).toEqual([0xc3, 0xa4]);
  });

  it('enforces L ≤ 255 · HashLen (RFC 5869 §2.3) for the expand modes only', () => {
    expect(runError({ ...base(), mac: tinyMac(1), length: 255 })).toBeUndefined();
    expect(runError({ ...base(), mac: tinyMac(0), length: 1 })).toEqual({
      key: `${NS}.error.lengthTooLong`,
      params: { max: 0 },
    });
    expect(runError({ ...base(), mode: 'extract', mac: tinyMac(0), length: 1 })).toBeUndefined();
  });

  it('accepts PRK = HashLen exactly and ignores PRK in the extract modes', () => {
    expect(runError({ ...base(), mode: 'expand', prk: new Array(32).fill(1) })).toBeUndefined();
    expect(runError({ ...base(), mode: 'hkdf', prk: [] })).toBeUndefined();
  });
});

describe('initialNarration and macName', () => {
  it('names the MAC from its member id', () => {
    expect(macName(sha256)).toBe('HMAC-SHA-256');
  });

  it('has one key per mode', () => {
    const keys = (['hkdf', 'extract', 'expand', 'expand-label'] as const).map(
      (mode) => initialNarration({ ...toRun(A1, sha256), mode, prk: new Array(32).fill(0) }).key,
    );
    expect(keys).toEqual(
      ['hkdf', 'extract', 'expand', 'expandLabel'].map((name) => `${NS}.step.initial.${name}`),
    );
  });
});

describe('hkdf presets and conformance vectors', () => {
  it('every vector reproduces its outputs (RFC 5869 A.1–A.7, RFC 8448)', async () => {
    expect(conformance.count).toBe(conformance.cases.length);
    expect(conformance.cases).toHaveLength(9);
    for (const vector of conformance.cases) {
      const trace = await bundle(vector.params as HkdfParams);
      for (const [name, hex] of Object.entries(vector.outputs))
        expect(hexOut(trace, name), vector.name).toBe(hex);
    }
  });

  it('every preset with a vector equals that vector', async () => {
    const byName = (fragment: string) =>
      conformance.cases.find((vector) => vector.name.includes(fragment))!;
    const pairs: [string, string][] = [
      ['rfc5869-a1', 'A.1'],
      ['rfc5869-a2', 'A.2'],
      ['rfc5869-a3', 'A.3'],
      ['rfc5869-a4', 'A.4'],
      ['rfc5869-a7', 'A.7'],
      ['tls13-derived', 'tls13 derived'],
      ['tls13-c-hs-traffic', 'c hs traffic'],
    ];
    for (const [id, fragment] of pairs) {
      const vector = byName(fragment);
      const trace = await bundle(preset(id));
      for (const [name, hex] of Object.entries(vector.outputs))
        expect(hexOut(trace, name), id).toBe(hex);
    }
  });
});
