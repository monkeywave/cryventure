import { blockCount, parseHexOrThrow, toHex, utf8Bytes } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import vectors from './vectors/tls-prf-cavp.json' with { type: 'json' };
import { concatBytes, decodePrfInputs, labelSeed, pHash, pHashChain, splitSecret, tls10Prf, tls12Prf } from './pHash.ts';
import { HMAC_MD5, HMAC_SHA1, HMAC_SHA256, HMAC_SHA384, oraclePHash, oracleTls10, oracleTls12, TLS12_HMACS } from './testMacs.ts';

const bytes = (hex: string) => parseHexOrThrow(hex);
const SECRET = bytes('9bbe436ba940f017b17652849a71db35');
const SEED = bytes('a0ba9f936cda311827a6f796ffd5198c');

interface CavpCase {
  name: string;
  kind: string;
  version: string;
  hash: string;
  preMasterSecret: string;
  clientHelloRandom: string;
  serverHelloRandom: string;
  clientRandom: string;
  serverRandom: string;
  masterSecret: string;
  keyBlockBits: number;
  keyBlock: string;
}

interface IetfCase {
  name: string;
  kind: string;
  hash: string;
  secret: string;
  label: string;
  seed: string;
  length: number;
  output: string;
}

const cavp = vectors.cases.filter((c) => c.kind === 'cavp') as CavpCase[];
const ietf = vectors.cases.filter((c) => c.kind === 'prf') as IetfCase[];

/** The PRF of a CAVP case's version: TLS 1.0/1.1 (MD5 ⊕ SHA-1) or TLS 1.2 over the section's hash. */
function cavpPrf(c: CavpCase) {
  return (secret: Uint8Array, label: string, seed: Uint8Array, length: number) =>
    c.version === 'tls10' ? tls10Prf(HMAC_MD5, HMAC_SHA1, secret, label, seed, length) : tls12Prf(TLS12_HMACS[c.hash]!, secret, label, seed, length);
}

describe('the vector file', () => {
  it('holds the 40 CAVP cases (10 per section) and the 4 IETF list cases it records', () => {
    expect(vectors.count).toBe(44);
    expect(cavp).toHaveLength(40);
    expect(ietf).toHaveLength(4);
  });
});

describe('CAVP SP 800-135 TLS (all sections) through the lib', () => {
  it.each(cavp.map((c) => [c.name, c] as const))('%s: master secret and key block', (_name, c) => {
    const prf = cavpPrf(c);
    const masterSecret = prf(bytes(c.preMasterSecret), 'master secret', bytes(c.clientHelloRandom + c.serverHelloRandom), 48);
    expect(toHex(masterSecret)).toBe(c.masterSecret);
    const keyBlock = prf(bytes(c.masterSecret), 'key expansion', bytes(c.serverRandom + c.clientRandom), c.keyBlockBits / 8);
    expect(toHex(keyBlock)).toBe(c.keyBlock);
  });
});

describe('IETF TLS list P_hash vectors through the lib', () => {
  it.each(ietf.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(toHex(tls12Prf(TLS12_HMACS[c.hash]!, bytes(c.secret), c.label, bytes(c.seed), c.length))).toBe(c.output);
  });
});

describe('P_hash block count (core blockCount)', () => {
  it('is ⌈length / outputSize⌉', () => {
    expect([0, 1, 32, 33, 48, 64, 65].map((length) => blockCount(length, 32))).toEqual([0, 1, 1, 2, 2, 2, 3]);
    expect(blockCount(104, 20)).toBe(6);
  });
});

describe('concatBytes and labelSeed', () => {
  it('joins in order without changing the inputs', () => {
    const a = Uint8Array.of(1, 2);
    const b = Uint8Array.of(3);
    expect(Array.from(concatBytes(a, b))).toEqual([1, 2, 3]);
    expect(Array.from(concatBytes(new Uint8Array(0), b))).toEqual([3]);
    expect(Array.from(a)).toEqual([1, 2]);
  });

  it('puts the ASCII label in front of the seed', () => {
    expect(toHex(labelSeed('master secret', Uint8Array.of(0xab)))).toBe(toHex(utf8Bytes('master secret')) + 'ab');
    expect(toHex(labelSeed('key expansion', new Uint8Array(0)))).toBe(toHex(utf8Bytes('key expansion')));
  });
});

describe('pHashChain', () => {
  const chain = pHashChain(HMAC_SHA256, SECRET, SEED, 100);

  it('chains A(i) = HMAC(secret, A(i−1)) from A(0) = seed', () => {
    expect(chain.a).toHaveLength(4);
    expect(toHex(chain.a[0]!)).toBe(toHex(HMAC_SHA256.mac(SECRET, SEED)));
    chain.a.slice(1).forEach((a, index) => expect(toHex(a)).toBe(toHex(HMAC_SHA256.mac(SECRET, chain.a[index]!))));
  });

  it('computes P(i) = HMAC(secret, A(i) ‖ seed) and concatenates them', () => {
    chain.p.forEach((p, index) => expect(toHex(p)).toBe(toHex(HMAC_SHA256.mac(SECRET, concatBytes(chain.a[index]!, SEED)))));
    expect(chain.stream).toHaveLength(128);
    expect(toHex(chain.stream)).toBe(chain.p.map((p) => toHex(p)).join(''));
  });

  it('truncates the stream to the length and matches the oracle', () => {
    expect(toHex(chain.output)).toBe(toHex(chain.stream.subarray(0, 100)));
    expect(toHex(chain.output)).toBe(toHex(oraclePHash(HMAC_SHA256, SECRET, SEED, 100)));
    expect(toHex(pHash(HMAC_SHA256, SECRET, SEED, 100))).toBe(toHex(chain.output));
  });

  it('needs no block for length 0 and exactly one at the hash length', () => {
    expect(pHashChain(HMAC_SHA256, SECRET, SEED, 0)).toMatchObject({ a: [], p: [] });
    expect(pHashChain(HMAC_SHA256, SECRET, SEED, 0).output).toHaveLength(0);
    expect(pHashChain(HMAC_SHA384, SECRET, SEED, 48).p).toHaveLength(1);
  });

  it('accepts an empty seed (A(1) = HMAC(secret, ""))', () => {
    expect(toHex(pHash(HMAC_SHA256, SECRET, new Uint8Array(0), 40))).toBe(toHex(oraclePHash(HMAC_SHA256, SECRET, new Uint8Array(0), 40)));
  });

  it('throws a RangeError for a negative or fractional length', () => {
    expect(() => pHashChain(HMAC_SHA256, SECRET, SEED, -1)).toThrow(RangeError);
    expect(() => pHashChain(HMAC_SHA256, SECRET, SEED, 1.5)).toThrow(RangeError);
  });

  it('leaves its inputs unchanged', () => {
    const secret = SECRET.slice();
    const seed = SEED.slice();
    pHashChain(HMAC_SHA256, secret, seed, 64);
    expect(toHex(secret)).toBe(toHex(SECRET));
    expect(toHex(seed)).toBe(toHex(SEED));
  });

  it('matches the oracle for every length around the block boundaries', () => {
    for (const length of [1, 31, 32, 33, 63, 64, 65, 256]) expect(toHex(pHash(HMAC_SHA256, SECRET, SEED, length))).toBe(toHex(oraclePHash(HMAC_SHA256, SECRET, SEED, length)));
  });
});

describe('splitSecret (RFC 2246 §5)', () => {
  it('halves an even-length secret', () => {
    const { s1, s2 } = splitSecret(Uint8Array.of(1, 2, 3, 4));
    expect([Array.from(s1), Array.from(s2)]).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('shares the middle byte of an odd-length secret (S1 = first ⌈n/2⌉, S2 = last ⌈n/2⌉)', () => {
    const { s1, s2 } = splitSecret(Uint8Array.of(1, 2, 3, 4, 5));
    expect([Array.from(s1), Array.from(s2)]).toEqual([
      [1, 2, 3],
      [3, 4, 5],
    ]);
  });

  it('uses a one-byte secret for both halves', () => {
    const { s1, s2 } = splitSecret(Uint8Array.of(7));
    expect([Array.from(s1), Array.from(s2)]).toEqual([[7], [7]]);
  });
});

describe('tls12Prf and tls10Prf against the oracle', () => {
  it('tls12Prf is P_hash over label ‖ seed', () => {
    expect(toHex(tls12Prf(HMAC_SHA256, SECRET, 'test label', SEED, 100))).toBe(toHex(oracleTls12(HMAC_SHA256, SECRET, 'test label', SEED, 100)));
  });

  it.each([1, 2, 5, 47, 48, 49])('tls10Prf with a %i-byte secret', (secretLength) => {
    const secret = Uint8Array.from({ length: secretLength }, (_, index) => (index * 37 + 11) & 0xff);
    expect(toHex(tls10Prf(HMAC_MD5, HMAC_SHA1, secret, 'test label', SEED, 77))).toBe(toHex(oracleTls10(secret, 'test label', SEED, 77)));
  });

  it('tls10Prf of an odd-length secret equals a value computed with @noble/hashes (scratch oracle)', () => {
    expect(toHex(tls10Prf(HMAC_MD5, HMAC_SHA1, bytes('0102030405'), 'test label', bytes('aabb'), 40))).toBe(
      '16ccf2af0d445d2b2576fbee9e0c309391d86daaa92f385773a43e1804082a65723249fe4b45241f',
    );
  });
});

describe('decodePrfInputs', () => {
  it('decodes secret and seed hex, joins label ‖ seed and reads the length', () => {
    const decoded = decodePrfInputs({ secret: '0102', label: 'ab', seed: 'ff', length: '48' });
    expect(decoded).toEqual({ secret: Uint8Array.of(1, 2), label: 'ab', seed: Uint8Array.of(0xff), labelSeed: Uint8Array.of(0x61, 0x62, 0xff), length: 48 });
  });
});
