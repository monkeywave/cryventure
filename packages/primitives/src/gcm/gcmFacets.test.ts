import {
  chainIssues,
  chainLabelRefs,
  parseHexOrThrow,
  parseHexToArray,
  preparePorts,
  Registry,
  toHex,
  validateFieldFacet,
  wireIssues,
  type BlockCipher,
  type I18nRef,
  type PortResolver,
  type PrimitiveManifest,
} from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { beforeAll, describe, expect, it } from 'vitest';
import de from './i18n/de.json' with { type: 'json' };
import en from './i18n/en.json' with { type: 'json' };
import { gcmChain, gcmField, gcmValues, gcmWire, releasesOutput } from './gcmFacets.ts';
import { recordGcm, type GcmRecording, type GcmRun } from './gcmTrace.ts';
import { gcmManifest } from './manifest.ts';
import { run } from './module.ts';
import { GF128_FIELD_NOTATION } from '../_lib/fieldNotation.ts';

const NS = 'plugin.gcm';
const TC4_KEY = 'feffe9928665731c6d6a8f9467308308';
const TC4_IV = 'cafebabefacedbaddecaf888';
const TC4_AAD = 'feedfacedeadbeeffeedfacedeadbeefabaddad2';
const TC4_PLAINTEXT = 'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39';
const TC4_CIPHERTEXT = '42831ec2217774244b7221b784d0d49ce3aa212f2c02a4e035c17e2329aca12e21d514b25466931c7d8f6a5aac84aa051ba30b396a0aac973d58e091';
const TC4_TAG = '5bc94fbc3221a5db94fae95ae7121a47';
const TC6_IV = '9313225df88406e555909c5aff5269aa6a7a9538534f7da1e4c303d2a318a728c3c0c95156809539fcf0e2429a6b525416aedbf5a0de6a57a637b39b';

let aes: BlockCipher;
let resolve: PortResolver;

beforeAll(async () => {
  const registry = new Registry<PrimitiveManifest>('producers');
  primitiveManifests.forEach((manifest) => registry.register(manifest));
  resolve = await preparePorts(gcmManifest, { cipher: 'aes' }, registry);
  aes = resolve('BlockCipher', 'aes')!;
});

function record(overrides: Partial<Omit<GcmRun, 'cipher'>> = {}): GcmRecording {
  return recordGcm({
    cipher: aes,
    key: parseHexOrThrow(TC4_KEY),
    iv: parseHexToArray(TC4_IV),
    aad: parseHexToArray(TC4_AAD),
    input: parseHexToArray(TC4_PLAINTEXT),
    direction: 'encrypt',
    tagBytes: 16,
    receivedTag: [],
    ...overrides,
  });
}

const decrypt = (tag: string) => record({ direction: 'decrypt', input: parseHexToArray(TC4_CIPHERTEXT), receivedTag: parseHexToArray(tag) });
const forged = () => decrypt(`5a${TC4_TAG.slice(2)}`);
const stepCount = (recording: GcmRecording) => recording.facet.steps.length;

/** `{{name}}` placeholders of a catalog template. */
const placeholders = (template: string) => [...template.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();

function catalogProblems(refs: readonly I18nRef[]): string[] {
  const catalogs: Record<string, Record<string, string>> = { en, de };
  return Object.entries(catalogs).flatMap(([locale, catalog]) =>
    refs.flatMap((ref) => {
      const template = catalog[ref.key];
      if (template === undefined) return [`${locale}: missing ${ref.key}`];
      const given = Object.keys(ref.params ?? {}).sort();
      return JSON.stringify(given) === JSON.stringify([...new Set(placeholders(template))]) ? [] : [`${locale}: ${ref.key} params ${given.join()}`];
    }),
  );
}

describe('gcm catalogs', () => {
  const ghashKeys = (catalog: Record<string, string>) => Object.entries(catalog).filter(([key]) => /^plugin\.gcm\.(field\.|step\.(ghash|lengthBlock|j0Ghash)|chain\.(hash|s)$|region\.x$)/.test(key));

  it.each([['en', en], ['de', de]])('%s writes the field product as • and the GHASH accumulator as Y, like the ghash plugin', (_, catalog) => {
    const entries = ghashKeys(catalog);
    expect(entries.length).toBeGreaterThan(10);
    expect(entries.filter(([, text]) => text.includes('·'))).toEqual([]);
    expect(entries.filter(([, text]) => /\bX(\{\{|$|\b)/.test(text))).toEqual([]);
  });

  it.each([['en', en], ['de', de]])('%s: op short labels (the right end of the scope path) are words, not formulas', (_, catalog) => {
    const short = Object.entries(catalog).filter(([key]) => key.startsWith(`${NS}.opShort.`));
    expect(short).toHaveLength(10);
    expect(short.filter(([, text]) => /[•·⊕×]|ᵢ|E_K|^inc32$/.test(text))).toEqual([]);
  });

  it('declines the AAD in German (dative plural, number and unit apart)', () => {
    for (const key of ['initial', 'initialGmac', 'initialDecrypt']) expect(de[`${NS}.step.${key}` as keyof typeof de], key).not.toMatch(/-Byte-AAD/);
    expect(de[`${NS}.step.initial`]).toContain('mit den {{aadBytes}} Byte AAD (zusätzlichen authentifizierten Daten)');
  });
});

describe('releasesOutput', () => {
  it('is true when encrypting or when the tag verifies, false on FAIL', () => {
    expect(releasesOutput({})).toBe(true);
    expect(releasesOutput({ verify: { step: 3, authentic: true } })).toBe(true);
    expect(releasesOutput({ verify: { step: 3, authentic: false } })).toBe(false);
  });
});

describe('gcmValues', () => {
  it('declares the inputs initially and the computed values when they appear (encrypt)', () => {
    const recording = record();
    const values = gcmValues(recording).values;
    expect(values.map((value) => [value.id, value.role])).toEqual([
      ['key', 'key'],
      ['iv', 'nonce'],
      ['aad', 'public'],
      ['plaintext', 'plaintext'],
      ['h', 'subkey'],
      ['j0', 'state'],
      ['s', 'state'],
      ['tag', 'tag'],
      ['ciphertext', 'ciphertext'],
    ]);
    expect(values.find((value) => value.id === 'tag')?.createdAt).toBe(recording.tagStep);
  });

  it('leaves out empty AAD and input (GMAC) and the plaintext of a forged message', () => {
    expect(gcmValues(record({ aad: [], input: [] })).values.map((value) => value.id)).toEqual(['key', 'iv', 'h', 'j0', 's', 'tag']);
    const ids = gcmValues(forged()).values.map((value) => value.id);
    expect(ids).toContain('receivedTag');
    expect(ids).not.toContain('plaintext');
  });

  it('releases the plaintext at the verify step of an authentic message', () => {
    const recording = decrypt(TC4_TAG);
    const plaintext = gcmValues(recording).values.find((value) => value.id === 'plaintext');
    expect(plaintext?.createdAt).toBe(recording.verify?.step);
    expect(toHex(plaintext?.bytes ?? [])).toBe(TC4_PLAINTEXT);
  });
});

describe('gcmChain', () => {
  it.each([
    ['encrypt', () => record()],
    ['decrypt (FAIL)', forged],
    ['GMAC', () => record({ input: [] })],
    ['60-byte IV', () => record({ iv: parseHexToArray(TC6_IV) })],
  ])('is consistent for %s', (_, make) => {
    const recording = make();
    expect(chainIssues(gcmChain(recording), stepCount(recording))).toEqual([]);
  });

  it('has CTR lanes plus a GHASH lane with kinds hash, aad, length and tag', () => {
    const chain = gcmChain(record());
    expect(chain).toMatchObject({ mode: 'gcm', direction: 'encrypt', formula: { key: `${NS}.formula.encrypt` } });
    const ghashLane = chain.nodes.filter((node) => node.block === 4).map((node) => node.kind);
    expect(new Set(ghashLane)).toEqual(new Set(['aad', 'hash', 'length', 'cipher', 'tag']));
    expect(chain.nodes.filter((node) => node.kind === 'hash')).toHaveLength(7);
    expect(chain.edges).toContainEqual(expect.objectContaining({ from: 'b3.output', to: 'ghash.x6' }));
  });

  it('zooms into every encryption: H, each counter block and J0', () => {
    const recording = record();
    const zooms = gcmChain(recording).nodes.flatMap((node) => (node.zoom === undefined ? [] : [node.zoom.blockHex]));
    expect(zooms).toEqual(['0'.repeat(32), ...recording.blocks.map((block) => toHex(block.counter)), toHex(recording.j0)]);
  });

  it('feeds J0 from the IV and H on the GHASH path only', () => {
    const fast = gcmChain(record()).edges.filter((edge) => edge.to === 'j0').map((edge) => edge.from);
    const slow = gcmChain(record({ iv: parseHexToArray(TC6_IV) })).edges.filter((edge) => edge.to === 'j0').map((edge) => edge.from);
    expect(fast).toEqual(['iv']);
    expect(slow).toEqual(['iv', 'h']);
  });

  it('withholds the candidate plaintext: on FAIL no XOR or output node carries bytes, and they are labelled as withheld', () => {
    const recording = forged();
    const lanes = gcmChain(recording).nodes.filter((node) => node.block >= 0 && node.block < recording.blocks.length);
    for (const node of lanes.filter((candidate) => candidate.kind === 'xor' || candidate.kind === 'output')) {
      expect(node.bytes, node.id).toEqual([]);
      expect(node.label.key, node.id).toBe(node.kind === 'xor' ? `${NS}.chain.xorWithheld` : `${NS}.chain.plaintextDiscarded`);
    }
  });

  it('releases the plaintext nodes of an authentic message only at the verify step', () => {
    const recording = decrypt(TC4_TAG);
    const nodes = gcmChain(recording).nodes;
    const outputs = nodes.filter((node) => node.kind === 'output');
    expect(toHex(outputs.flatMap((node) => node.bytes))).toBe(TC4_PLAINTEXT);
    expect(outputs.every((node) => node.activeAt === recording.verify?.step && node.label.key === `${NS}.chain.plaintext`)).toBe(true);
    expect(nodes.filter((node) => node.kind === 'xor').every((node) => node.bytes.length === 0 && node.label.key === `${NS}.chain.xorWithheld`)).toBe(true);
  });

  it('labels its nodes with keys and params present in EN and DE (decrypt)', () => {
    expect(catalogProblems(chainLabelRefs(gcmChain(forged())))).toEqual([]);
    expect(catalogProblems(chainLabelRefs(gcmChain(decrypt(TC4_TAG))))).toEqual([]);
  });

  it('compares the recomputed and the received tag when decrypting', () => {
    const chain = gcmChain(forged());
    expect(chain.nodes.find((node) => node.id === 'tag.verify')?.label.key).toBe(`${NS}.chain.verifyFail`);
    expect(chain.edges.filter((edge) => edge.to === 'tag.verify').map((edge) => edge.from)).toEqual(['tag.t', 'tag.received']);
  });
});

describe('gcmWire', () => {
  it.each([
    ['encrypt', () => record()],
    ['decrypt', () => decrypt(TC4_TAG)],
    ['GMAC without AAD', () => record({ input: [], aad: [] })],
  ])('is consistent for %s', (_, make) => {
    const recording = make();
    expect(wireIssues(gcmWire(recording), stepCount(recording))).toEqual([]);
  });

  it('sends IV and AAD first, each ciphertext block when XORed and the tag last (encrypt)', () => {
    const recording = record();
    const wire = gcmWire(recording);
    expect(wire.segments.map((segment) => [segment.id, segment.role, segment.availableAt])).toEqual([
      ['iv', 'iv', -1],
      ['aad', 'aad', -1],
      ...recording.blocks.map((block, index) => [`c${index}`, 'ciphertext', block.steps.xor]),
      ['tag', 'tag', recording.tagStep],
    ]);
  });

  it('receives everything initially when decrypting, the tag being the received one', () => {
    const wire = gcmWire(forged());
    expect(wire.segments.every((segment) => segment.availableAt === -1)).toBe(true);
    expect(wire.segments.at(-1)).toMatchObject({ id: 'tag', valueRef: 'receivedTag', bytes: parseHexToArray(`5a${TC4_TAG.slice(2)}`) });
  });
});

describe('gcmField', () => {
  it('has one valid step per GHASH multiply, with the terms X ⊕ B, H and the product', () => {
    const recording = record({ iv: parseHexToArray(TC6_IV) });
    const field = gcmField(recording);
    expect(validateFieldFacet(field)).toEqual([]);
    expect(field.notation).toEqual({ field: 'gf2^128', modulus: 'x^128+x^7+x^2+x+1', bitOrder: 'gcm-reflected' });
    expect(field.steps.map((step) => step.step)).toEqual([-1, ...[...recording.j0Ghash, ...recording.ghash].map((trace) => trace.step)]);
    const last = field.steps.at(-1)!;
    expect(last.terms.map((term) => term.id)).toEqual(['sum', 'h', 'product']);
    expect(last.terms[2]?.bytes).toEqual(recording.s);
  });

  it('opens with a step −1 entry: GHASH starts from Y₀ = 0 once the setup has derived H', () => {
    const field = gcmField(record());
    expect(field.steps[0]).toMatchObject({ step: -1, formula: { key: `${NS}.field.initial` } });
    expect(field.steps[0]?.terms).toEqual([expect.objectContaining({ id: 'y0', bytes: new Array<number>(16).fill(0) })]);
    expect(validateFieldFacet(field)).toEqual([]);
  });

  it('uses the shared GF(2¹²⁸) notation of the primitives _lib', () => {
    expect(gcmField(record()).notation).toBe(GF128_FIELD_NOTATION);
  });

  it('labels its steps and terms with keys and params present in EN and DE', () => {
    const refs = gcmField(record({ iv: parseHexToArray(TC6_IV) })).steps.flatMap((step) => [step.formula, ...step.terms.map((term) => term.label)]);
    expect(catalogProblems(refs)).toEqual([]);
  });
});

/** Every hex string and byte array (as hex) inside `value`, recursively. */
function hexesIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.every((item) => typeof item === 'number') && value.length > 0 ? [toHex(value as number[])] : value.flatMap(hexesIn);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(hexesIn);
  return [];
}

describe('decrypt FAIL (forged-tag preset)', () => {
  it('shows no plaintext bytes in chain, wire, narration, values or output', () => {
    const preset = gcmManifest.presets.find((candidate) => candidate.id === 'decrypt-forged')!;
    const result = run(preset.params, { resolve });
    if (!result.ok) throw new Error(result.error.key);
    const { facets, output } = result.trace;
    // 8-byte windows at every block start: catches whole blocks, truncated tails and spaced/abbreviated hex alike.
    const plaintext = parseHexToArray(TC4_PLAINTEXT);
    const needles = Array.from({ length: Math.ceil(plaintext.length / 8) }, (_, index) => toHex(plaintext.slice(index * 8, index * 8 + 8)));
    const shown = { chain: facets['chain@default'], wire: facets['wire@default'], narration: facets['narration@default'], values: facets['values@default'], output };
    for (const [name, facet] of Object.entries(shown)) {
      expect(facet, name).toBeDefined();
      const leaks = hexesIn(facet).filter((hex) => needles.some((needle) => hex.includes(needle)));
      expect(leaks, name).toEqual([]);
    }
  });
});
