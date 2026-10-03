import {
  gcmHashSubkey,
  gcmJ0,
  ghash,
  parseHexOrThrow,
  parseHexToArray,
  preparePorts,
  Registry,
  toHex,
  type BlockCipher,
  type PrimitiveManifest,
} from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { beforeAll, describe, expect, it } from 'vitest';
import { tagGhashInputs } from './gcmBlocks.ts';
import { gcmCiphertext, gcmCtrOutput, gcmRegions, gcmRegionSizes, GCM_PHASES, ioRegions, recordGcm, tagsMatch, type GcmRun } from './gcmTrace.ts';
import { gcmManifest } from './manifest.ts';

const NS = 'plugin.gcm';
const TC4_KEY = 'feffe9928665731c6d6a8f9467308308';
const TC4_IV = 'cafebabefacedbaddecaf888';
const TC4_AAD = 'feedfacedeadbeeffeedfacedeadbeefabaddad2';
const TC4_PLAINTEXT = 'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39';
const TC4_CIPHERTEXT = '42831ec2217774244b7221b784d0d49ce3aa212f2c02a4e035c17e2329aca12e21d514b25466931c7d8f6a5aac84aa051ba30b396a0aac973d58e091';
const TC4_TAG = '5bc94fbc3221a5db94fae95ae7121a47';
const TC6_IV = '9313225df88406e555909c5aff5269aa6a7a9538534f7da1e4c303d2a318a728c3c0c95156809539fcf0e2429a6b525416aedbf5a0de6a57a637b39b';

let aes: BlockCipher;

beforeAll(async () => {
  const registry = new Registry<PrimitiveManifest>('producers');
  primitiveManifests.forEach((manifest) => registry.register(manifest));
  aes = (await preparePorts(gcmManifest, { cipher: 'aes' }, registry))('BlockCipher', 'aes')!;
});

function tc4(overrides: Partial<Omit<GcmRun, 'cipher'>> = {}): GcmRun {
  return {
    cipher: aes,
    key: parseHexOrThrow(TC4_KEY),
    iv: parseHexToArray(TC4_IV),
    aad: parseHexToArray(TC4_AAD),
    input: parseHexToArray(TC4_PLAINTEXT),
    direction: 'encrypt',
    tagBytes: 16,
    receivedTag: [],
    ...overrides,
  };
}

const decryptRun = (tag: string) => tc4({ direction: 'decrypt', input: parseHexToArray(TC4_CIPHERTEXT), receivedTag: parseHexToArray(tag) });

describe('ioRegions', () => {
  it('reads the plaintext and writes the ciphertext when encrypting, and the reverse when decrypting', () => {
    expect(ioRegions('encrypt')).toEqual({ input: 'plaintext', output: 'ciphertext' });
    expect(ioRegions('decrypt')).toEqual({ input: 'ciphertext', output: 'candidate' });
  });
});

describe('gcmRegionSizes', () => {
  it('lists every region in display order', () => {
    expect(gcmRegionSizes(tc4())).toEqual({ iv: 12, aad: 20, plaintext: 60, ciphertext: 60, h: 16, j0: 16, counter: 16, keystream: 16, x: 16, lengths: 16, tag: 16 });
  });

  it('drops empty AAD and input, and adds the received tag when decrypting', () => {
    expect(Object.keys(gcmRegionSizes(tc4({ aad: [], input: [] })))).not.toContain('aad');
    expect(Object.keys(gcmRegionSizes(tc4({ input: [] })))).not.toContain('plaintext');
    expect(gcmRegionSizes({ ...decryptRun(TC4_TAG.slice(0, 24)), tagBytes: 12 })).toMatchObject({ tag: 12, receivedTag: 12 });
  });
});

describe('gcmRegions', () => {
  it('starts with the given inputs, a real zero accumulator and blank computed regions', () => {
    const { regions, initial } = gcmRegions(tc4());
    expect(initial.plaintext).toEqual(parseHexToArray(TC4_PLAINTEXT));
    expect(initial.aad).toEqual(parseHexToArray(TC4_AAD));
    expect(initial.x).toEqual(new Array<number>(16).fill(0));
    const blank = regions.filter((region) => region.initial === 'blank').map((region) => region.id);
    expect(blank).toEqual(['ciphertext', 'h', 'j0', 'counter', 'keystream', 'lengths', 'tag']);
    expect(regions.every((region) => region.labelKey === `${NS}.region.${region.id}`)).toBe(true);
  });

  it('fills the ciphertext and the received tag when decrypting', () => {
    const { initial } = gcmRegions(decryptRun(TC4_TAG));
    expect(toHex(initial.ciphertext)).toBe(TC4_CIPHERTEXT);
    expect(toHex(initial.receivedTag)).toBe(TC4_TAG);
  });

  it('adds a blank candidate region before a blank plaintext region when decrypting', () => {
    const { regions } = gcmRegions(decryptRun(TC4_TAG));
    expect(regions.map((region) => region.id)).toEqual(['iv', 'aad', 'ciphertext', 'candidate', 'plaintext', 'h', 'j0', 'counter', 'keystream', 'x', 'lengths', 'tag', 'receivedTag']);
    const blank = regions.filter((region) => region.initial === 'blank').map((region) => region.id);
    expect(blank).toEqual(['candidate', 'plaintext', 'h', 'j0', 'counter', 'keystream', 'lengths', 'tag']);
  });
});

describe('tagsMatch', () => {
  it('compares contents and lengths', () => {
    expect(tagsMatch([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(tagsMatch([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(tagsMatch([1, 2], [1, 2, 0])).toBe(false);
    expect(tagsMatch([], [])).toBe(true);
  });
});

describe('recordGcm', () => {
  it('records the phases setup → ctr → ghash → tag, each its own scope', () => {
    const recording = recordGcm(tc4());
    const ops = recording.facet.steps.map((step) => `${GCM_PHASES[step.scope[0]!]}:${step.op}`);
    expect(ops.slice(0, 5)).toEqual(['setup:hashKey', 'setup:j0', 'ctr:inc32', 'ctr:encryptCounter', 'ctr:xorKeystream']);
    expect(ops.filter((op) => op.startsWith('ghash:'))).toEqual(['ghash:ghashBlock', 'ghash:ghashBlock', 'ghash:ghashBlock', 'ghash:ghashBlock', 'ghash:ghashBlock', 'ghash:ghashBlock', 'ghash:lengthBlock']);
    expect(ops.slice(-2)).toEqual(['tag:encryptJ0', 'tag:tag']);
    expect(recording.facet.steps.every((step) => step.scope.length === 2)).toBe(true);
  });

  it('derives H and J0 like the core reference, and S as GHASH over A ‖ C ‖ lengths', () => {
    const recording = recordGcm(tc4());
    const h = gcmHashSubkey(aes, parseHexOrThrow(TC4_KEY));
    expect(recording.h).toEqual(Array.from(h));
    expect(recording.j0).toEqual(Array.from(gcmJ0(h, parseHexOrThrow(TC4_IV))));
    expect(recording.j0Ghash).toEqual([]);
    const data = Uint8Array.from(tagGhashInputs(parseHexToArray(TC4_AAD), gcmCtrOutput(recording)).flatMap((input) => input.block));
    expect(recording.s).toEqual(Array.from(ghash(h, data)));
    expect(toHex(gcmCtrOutput(recording))).toBe(TC4_CIPHERTEXT);
    expect(toHex(recording.tag)).toBe(TC4_TAG);
  });

  it('forms J0 through GHASH for a 60-byte IV (TC 6), one step per block', () => {
    const recording = recordGcm(tc4({ iv: parseHexToArray(TC6_IV) }));
    const h = gcmHashSubkey(aes, parseHexOrThrow(TC4_KEY));
    expect(recording.j0).toEqual(Array.from(gcmJ0(h, parseHexOrThrow(TC6_IV))));
    expect(recording.j0Ghash.map((trace) => trace.source)).toEqual(['iv', 'iv', 'iv', 'iv', 'ivLength']);
    expect(recording.j0Step).toBe(recording.j0Ghash[4]?.step);
    expect(recording.facet.steps[recording.j0Step]?.narration.key).toBe(`${NS}.step.j0GhashLength`);
  });

  it('records GMAC (empty input) with an empty ctr phase', () => {
    const recording = recordGcm(tc4({ input: [] }));
    expect(recording.blocks).toEqual([]);
    expect(recording.facet.steps.some((step) => step.scope[0] === 1)).toBe(false);
    expect(recording.ghash.map((trace) => trace.source)).toEqual(['aad', 'aad', 'length']);
    expect(recording.facet.initialNarration?.key).toBe(`${NS}.step.initialGmac`);
  });

  it('truncates the tag to MSB_t and narrates the truncation', () => {
    const recording = recordGcm(tc4({ tagBytes: 12 }));
    expect(toHex(recording.tag)).toBe(TC4_TAG.slice(0, 24));
    expect(recording.facet.steps[recording.tagStep]?.narration).toMatchObject({ key: `${NS}.step.tagTruncated`, params: { tagBytes: 12, tagBits: 96 } });
  });

  it('verifies an authentic decryption and releases the plaintext', () => {
    const recording = recordGcm(decryptRun(TC4_TAG));
    expect(recording.verify?.authentic).toBe(true);
    expect(toHex(gcmCtrOutput(recording))).toBe(TC4_PLAINTEXT);
    expect(toHex(gcmCiphertext(recording))).toBe(TC4_CIPHERTEXT);
    expect(recording.facet.steps.at(-1)).toMatchObject({ op: 'verify', writes: [{ region: 'plaintext', offset: 0, values: parseHexToArray(TC4_PLAINTEXT) }], narration: { key: `${NS}.step.verifyOk` } });
  });

  it('decrypts into the withheld candidate region; the plaintext region stays blank until the tag verifies', () => {
    const recording = recordGcm(decryptRun(TC4_TAG));
    const xorSteps = recording.blocks.map((block) => recording.facet.steps[block.steps.xor]!);
    expect(xorSteps.every((step) => step.writes.every((write) => write.region === 'candidate'))).toBe(true);
    const beforeVerify = recording.facet.steps.slice(0, recording.verify!.step);
    expect(beforeVerify.some((step) => step.writes.some((write) => write.region === 'plaintext'))).toBe(false);
  });

  it('withholds the candidate in the XOR narration of a decryption', () => {
    const recording = recordGcm(decryptRun(TC4_TAG));
    const narrations = recording.blocks.map((block) => recording.facet.steps[block.steps.xor]!.narration);
    expect(narrations.map((narration) => narration.key)).toEqual([`${NS}.step.xorKeystreamWithheld`, `${NS}.step.xorKeystreamWithheld`, `${NS}.step.xorKeystreamWithheld`, `${NS}.step.xorKeystreamWithheldPartial`]);
    expect(narrations.every((narration) => !('output' in (narration.params ?? {})))).toBe(true);
  });

  it('narrates FAIL for a forged tag, wipes the candidate and never writes the plaintext region', () => {
    const forged = `5a${TC4_TAG.slice(2)}`;
    const recording = recordGcm(decryptRun(forged));
    expect(recording.verify?.authentic).toBe(false);
    const last = recording.facet.steps.at(-1)!;
    expect(last.narration).toEqual({ key: `${NS}.step.verifyFail`, params: { computed: TC4_TAG, received: forged } });
    expect(last.writes).toEqual([{ region: 'candidate', offset: 0, values: new Array<number>(60).fill(0) }]);
    expect(recording.facet.steps.some((step) => step.writes.some((write) => write.region === 'plaintext'))).toBe(false);
  });

  it('marks partial blocks in the CTR and GHASH narrations', () => {
    const steps = recordGcm(tc4()).facet.steps;
    expect(steps.find((step) => step.narration.key === `${NS}.step.xorKeystreamPartial`)?.narration.params).toMatchObject({ n: 4, used: 12, unused: 4 });
    expect(steps.find((step) => step.narration.key === `${NS}.step.ghashAadPartial`)?.narration.params).toMatchObject({ index: 2, used: 4, zeros: 12 });
    expect(steps.find((step) => step.narration.key === `${NS}.step.ghashCiphertextPartial`)?.narration.params).toMatchObject({ index: 4, used: 12, zeros: 4 });
  });
});
