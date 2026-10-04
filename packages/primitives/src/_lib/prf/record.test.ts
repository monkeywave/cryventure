import { parseHexOrThrow, toHex, u8Regions, zeroSnapshot, type I18nRef } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { labelSeed, pHashChain } from './pHash.ts';
import { macDisplayName as macName } from '../hmac/macCalls.ts';
import { PrfRecorder, prfName, recordChainBlock, recordSeedStep, type PrfChainSpec, type PrfOpName } from './record.ts';
import { HMAC_MD5, HMAC_SHA1, HMAC_SHA256 } from './testMacs.ts';

const NS = 'plugin.test-prf';
type Region = 'secret' | 'labelSeed' | 'a' | 'p' | 'stream';

const SECRET = parseHexOrThrow('0102030405');
const JOINED = labelSeed('test label', parseHexOrThrow('aabb'));
const CHAIN = pHashChain(HMAC_SHA256, SECRET, JOINED, 40);
const LEVELS = [{ labelKey: `${NS}.scope.block` }, { labelKey: `${NS}.scope.op` }];

function recorder(): PrfRecorder<Region> {
  const regions = u8Regions<Region>(NS, { secret: SECRET.length, labelSeed: JOINED.length, a: 32, p: 32, stream: CHAIN.stream.length }, ['labelSeed', 'a', 'p', 'stream']);
  return new PrfRecorder<Region>(regions, { ...zeroSnapshot(regions), secret: Array.from(SECRET) }, { key: `${NS}.step.initial` }, LEVELS);
}

/** A step with no writes or highlights, for scope tests. */
const bare = (op: PrfOpName) => ({ op, writes: [], highlights: [], narration: { key: `${NS}.step.${op}` } });

const SPEC: PrfChainSpec<Region> = {
  ns: NS,
  mac: HMAC_SHA256,
  keySymbol: 'secret',
  key: SECRET,
  labelSeed: JOINED,
  chain: CHAIN,
  regions: { key: 'secret', labelSeed: 'labelSeed', a: 'a', p: 'p', stream: 'stream' },
};

describe('macName and prfName', () => {
  it('name the HMAC member and its P_hash', () => {
    expect([macName(HMAC_SHA256), prfName(HMAC_SHA256)]).toEqual(['HMAC-SHA-256', 'P_SHA-256']);
    expect([macName(HMAC_MD5), prfName(HMAC_MD5)]).toEqual(['HMAC-MD5', 'P_MD5']);
    expect(prfName(HMAC_SHA1)).toBe('P_SHA-1');
    expect(prfName({ id: 'hmac-sha-512/256' })).toBe('P_SHA-512/256');
  });
});

describe('PrfRecorder', () => {
  it('records each step in its own op scope under the open outer scope', () => {
    const rec = recorder();
    const indices = rec.scope(() => [rec.step(bare('seed')), rec.step(bare('a'))]);
    const last = rec.scope(() => rec.step(bare('output')));
    expect([...indices, last]).toEqual([0, 1, 2]);
    const facet = rec.stateFacet();
    expect(facet.steps.map((step) => step.scope)).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
    expect(facet.scopeLevels).toEqual(LEVELS);
    expect(facet.initialNarration).toEqual({ key: `${NS}.step.initial` });
  });

  it('closes the outer scope when the body throws', () => {
    const rec = recorder();
    expect(() =>
      rec.scope(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    rec.scope(() => rec.step(bare('seed')));
    expect(rec.stateFacet().steps[0]?.scope).toEqual([1, 0]);
  });
});

describe('recordSeedStep', () => {
  it('writes label ‖ seed and narrates the label and the byte counts', () => {
    const rec = recorder();
    const step = rec.scope(() => recordSeedStep(rec, NS, 'labelSeed', 'test label', JOINED));
    const recorded = rec.stateFacet().steps[step]!;
    expect(recorded.op).toBe('seed');
    expect(toHex(recorded.writes[0]!.values)).toBe(toHex(JOINED));
    expect(recorded.narration).toEqual({ key: `${NS}.step.seed`, params: { label: 'test label', labelLength: 10, seedLength: 2, total: 12 } });
  });
});

describe('recordChainBlock', () => {
  const rec = recorder();
  const steps = rec.scope(() => [recordChainBlock(rec, SPEC, 0), recordChainBlock(rec, SPEC, 1)]);
  const facet = rec.stateFacet();
  const narration = (index: number) => facet.steps[index]!.narration as I18nRef;

  it('records a then p per block and returns their indices', () => {
    expect(steps).toEqual([
      { a: 0, p: 1 },
      { a: 2, p: 3 },
    ]);
    expect(facet.steps.map((step) => step.op)).toEqual(['a', 'p', 'a', 'p']);
  });

  it('writes A(i) and P(i), and P(i) into its stream slot', () => {
    expect(toHex(facet.steps[2]!.writes[0]!.values)).toBe(toHex(CHAIN.a[1]!));
    expect(facet.steps[3]!.writes.map((write) => [write.region, write.offset, toHex(write.values)])).toEqual([
      ['p', 0, toHex(CHAIN.p[1]!)],
      ['stream', 32, toHex(CHAIN.p[1]!)],
    ]);
  });

  it('reads label ‖ seed for A(1) and the previous A afterwards', () => {
    expect(facet.steps[0]!.highlights.map((h) => h.region)).toEqual(['secret', 'labelSeed', 'a']);
    expect(facet.steps[2]!.highlights.map((h) => h.region)).toEqual(['secret', 'a', 'a']);
    expect(facet.steps[3]!.highlights.at(-1)).toEqual({ region: 'stream', kind: 'write', indices: Array.from({ length: 32 }, (_, i) => 32 + i) });
  });

  it('narrates A(1) without an index, later blocks with i and prev, and P with its stream range', () => {
    const common = { prf: 'P_SHA-256', mac: 'HMAC-SHA-256', key: 'secret', n: 2 };
    expect(narration(0)).toEqual({ key: `${NS}.step.aFirst`, params: { ...common, value: toHex(CHAIN.a[0]!) } });
    expect(narration(2)).toEqual({ key: `${NS}.step.a`, params: { ...common, i: 2, prev: 1, value: toHex(CHAIN.a[1]!) } });
    expect(narration(3)).toEqual({ key: `${NS}.step.p`, params: { ...common, i: 2, value: toHex(CHAIN.p[1]!), from: 33, to: 64 } });
  });
});
