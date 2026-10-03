import { GCM_TAG_BYTES, preparePorts, Registry, toHex, type PortResolver, type PrimitiveManifest, type RunResult } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { beforeAll, describe, expect, it } from 'vitest';
import wycheproof from './vectors/wycheproof-aes-gcm.json' with { type: 'json' };
import { gcmManifest, type GcmParams } from './manifest.ts';
import { run } from './module.ts';

/** Every case of the filtered Wycheproof AES-GCM file (docs/M4.md §2c) through the traced producer. */
interface WycheproofCase {
  tcId: number;
  flags: string[];
  key: string;
  iv: string;
  aad: string;
  msg: string;
  ct: string;
  tag: string;
  tagBytes: number;
  result: 'valid' | 'acceptable' | 'invalid';
}

const cases = wycheproof.cases as WycheproofCase[];
/** Hundreds of fully traced runs per test: well over vitest's 5 s default on a loaded machine. */
const WHOLE_FILE_TIMEOUT_MS = 60_000;
let resolve: PortResolver;

beforeAll(async () => {
  const registry = new Registry<PrimitiveManifest>('producers');
  primitiveManifests.forEach((manifest) => registry.register(manifest));
  resolve = await preparePorts(gcmManifest, { cipher: 'aes' }, registry);
});

function params(testCase: WycheproofCase, direction: GcmParams['direction']): GcmParams {
  const input = direction === 'encrypt' ? testCase.msg : testCase.ct;
  return { cipher: 'aes', keyHex: testCase.key, ivHex: testCase.iv, aadHex: testCase.aad, inputHex: input, direction, tagHex: direction === 'decrypt' ? testCase.tag : '', tagBytes: String(testCase.tagBytes) };
}

function outputs(result: RunResult): Record<string, string> {
  if (!result.ok) throw new Error(`run error ${result.error.key}`);
  return Object.fromEntries(Object.entries(result.trace.output).map(([name, bytes]) => [name, toHex(bytes)]));
}

describe('Wycheproof AES-GCM (filtered)', () => {
  it('records its provenance, filter, licence notice and counts', () => {
    expect(wycheproof.source.commit).toMatch(/^[0-9a-f]{40}$/);
    // One source SHA only: the commit the file was taken at.
    expect(JSON.stringify(wycheproof.source).match(/[0-9a-f]{40}/g)).toEqual([wycheproof.source.commit]);
    expect(wycheproof.license).toBe('Apache-2.0');
    expect(wycheproof.header).toContain('Apache License, Version 2.0');
    const { counts } = wycheproof;
    expect(counts.kept).toBe(cases.length);
    expect(counts.keptValid + counts.keptAcceptable + counts.keptInvalid).toBe(cases.length);
    expect(counts.kept + counts.dropped).toBe(counts.source);
    // Every kept case has a full 16-byte tag; truncated tags are covered by the truncated-tag preset and the noble oracle.
    const tagBytes: Record<string, number> = {};
    for (const testCase of cases) tagBytes[testCase.tagBytes] = (tagBytes[testCase.tagBytes] ?? 0) + 1;
    expect(counts.keptByTagBytes).toEqual(tagBytes);
    expect(Object.keys(tagBytes)).toEqual(['16']);
  });

  it('keeps only cases within the filter, including the J0 and inc32 edge cases', () => {
    for (const testCase of cases) {
      expect([16, 24, 32]).toContain(testCase.key.length / 2);
      expect(testCase.iv.length / 2).toBeGreaterThanOrEqual(1);
      expect(Math.max(testCase.iv.length, testCase.msg.length, testCase.aad.length) / 2).toBeLessThanOrEqual(64);
    }
    for (const testCase of cases) expect(GCM_TAG_BYTES, `tcId ${testCase.tcId}`).toContain(testCase.tagBytes);
    const flags = new Set(cases.flatMap((testCase) => testCase.flags));
    for (const flag of ['SmallIv', 'LongIv', 'CounterWrap']) expect(flags).toContain(flag);
  });

  it('valid and acceptable cases reproduce ciphertext and tag, and decrypt to the message', () => {
    for (const testCase of cases.filter((candidate) => candidate.result !== 'invalid')) {
      expect(outputs(run(params(testCase, 'encrypt'), { resolve })), `tcId ${testCase.tcId}`).toEqual({ ciphertext: testCase.ct, tag: testCase.tag });
      expect(outputs(run(params(testCase, 'decrypt'), { resolve })), `tcId ${testCase.tcId}`).toEqual({ plaintext: testCase.msg });
    }
  }, WHOLE_FILE_TIMEOUT_MS);

  it('invalid cases decrypt to {} (FAIL, no plaintext)', () => {
    for (const testCase of cases.filter((candidate) => candidate.result === 'invalid')) {
      expect(outputs(run(params(testCase, 'decrypt'), { resolve })), `tcId ${testCase.tcId}`).toEqual({});
    }
  }, WHOLE_FILE_TIMEOUT_MS);
});
