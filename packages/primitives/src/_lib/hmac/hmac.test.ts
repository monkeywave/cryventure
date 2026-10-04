import { describe, expect, it } from 'vitest';
import { hmacFunction, hmacK0, IPAD, OPAD, xorPad } from './hmac.ts';
import { bytes, hex, HMAC_HASHES, testHash } from './testHashes.ts';
import cavp from './vectors/cavp-subset.json';
import pythonOracle from './vectors/python-oracle.json';
import rfc2202 from './vectors/rfc2202.json';
import rfc4231 from './vectors/rfc4231.json';
import wycheproof from './vectors/wycheproof-subset.json';

interface Vector {
  readonly name: string;
  readonly hash: string;
  readonly key: string;
  readonly msg: string;
  readonly tag: string;
}

const hmacOf = (hashName: string) => {
  const hash = testHash(hashName);
  return hmacFunction(hash, `test:${hash.id}`, `hmac-${hash.id}`);
};

/** The tag of `vector`, truncated to the vector's tag length (RFC 4231 TC5, RFC 2202 TC5, CAVP tlen, Wycheproof truncated groups). */
function truncatedTag(vector: Vector): string {
  const tag = hmacOf(vector.hash).mac(bytes(vector.key), bytes(vector.msg));
  return hex(tag.subarray(0, vector.tag.length / 2));
}

const named = (cases: readonly Vector[]) => cases.map((vector) => [vector.name, vector] as const);

describe('hmacFunction: published vectors through the untraced hash functions', () => {
  it.each(named(rfc4231.cases))('%s', (_, vector) => {
    expect(truncatedTag(vector)).toBe(vector.tag);
  });

  it.each(named(rfc2202.cases))('%s', (_, vector) => {
    expect(truncatedTag(vector)).toBe(vector.tag);
  });

  it.each(named(cavp.cases))('%s', (_, vector) => {
    expect(truncatedTag(vector)).toBe(vector.tag);
  });

  it.each(named(wycheproof.cases))('%s', (_, vector) => {
    expect(truncatedTag(vector)).toBe(vector.tag);
  });

  it('covers every hash function that gets an HMAC member', () => {
    const covered = new Set([...rfc4231.cases, ...rfc2202.cases, ...cavp.cases, ...wycheproof.cases, ...pythonOracle.cases].map((vector) => testHash(vector.hash).id));
    expect([...covered].sort()).toEqual(HMAC_HASHES.map((hash) => hash.id).sort());
  });

  it('includes RFC 2202 TC5 truncated to 96 bits', () => {
    for (const vector of rfc2202.cases.filter((candidate) => candidate.truncated !== undefined)) {
      expect(truncatedTag({ ...vector, tag: vector.truncated!.tag })).toBe(vector.truncated!.tag);
    }
  });
});

describe('hmacFunction: keys around B (Python hmac + hashlib)', () => {
  it.each(pythonOracle.cases.map((vector) => [`${vector.hash} key ${vector.key.length / 2} bytes (B = ${vector.blockSize})`, vector] as const))('%s', (_, vector) => {
    expect(testHash(vector.hash).blockSize).toBe(vector.blockSize);
    expect(hex(hmacOf(vector.hash).mac(bytes(vector.key), bytes(vector.msg)))).toBe(vector.tag);
  });
});

describe('hmacK0', () => {
  const sha256 = testHash('sha-256');

  it('keeps a B-byte key as is', () => {
    const key = Uint8Array.from({ length: 64 }, (_, index) => index);
    const { k0, branch } = hmacK0(sha256, key);
    expect(branch).toBe('exact');
    expect(k0).toEqual(key);
    expect(k0).not.toBe(key);
  });

  it('zero-pads a shorter key to B bytes', () => {
    const { k0, branch } = hmacK0(sha256, Uint8Array.of(1, 2, 3));
    expect(branch).toBe('padded');
    expect(k0.length).toBe(64);
    expect(hex(k0)).toBe(`010203${'00'.repeat(61)}`);
  });

  it('pads the empty key to B zero bytes', () => {
    expect(hmacK0(sha256, new Uint8Array(0))).toEqual({ k0: new Uint8Array(64), branch: 'padded' });
  });

  it('hashes a longer key, then zero-pads H(K) to B bytes', () => {
    const key = new Uint8Array(65).fill(0xaa);
    const { k0, branch } = hmacK0(sha256, key);
    expect(branch).toBe('hashed');
    expect(hex(k0)).toBe(hex(sha256.hash(key)) + '00'.repeat(32));
  });

  it('uses the rate as B for SHA3 (136 bytes for SHA3-256)', () => {
    const sha3 = testHash('sha3-256');
    expect(hmacK0(sha3, new Uint8Array(136)).branch).toBe('exact');
    expect(hmacK0(sha3, new Uint8Array(137)).branch).toBe('hashed');
    expect(hmacK0(sha3, new Uint8Array(1)).k0.length).toBe(136);
  });
});

describe('xorPad', () => {
  it('XORs every byte of K0 with the pad byte and leaves K0 unchanged', () => {
    const k0 = Uint8Array.of(0x00, 0xff, 0x36, 0x5c);
    expect(hex(xorPad(k0, IPAD))).toBe('36c9006a');
    expect(hex(xorPad(k0, OPAD))).toBe('5ca36a00');
    expect(hex(k0)).toBe('00ff365c');
  });

  it('has the FIPS 198-1 pad bytes', () => {
    expect([IPAD, OPAD]).toEqual([0x36, 0x5c]);
  });
});

describe('hmacFunction: metadata and options', () => {
  const fn = hmacFunction(testHash('sha-512/256'), 'sha512:sha-512/256', 'hmac-sha-512/256');

  it('describes the function by its hash', () => {
    expect(fn).toMatchObject({
      id: 'hmac-sha-512/256',
      outputSize: 32,
      blockSize: 128,
      keySizes: { min: 0 },
      customizable: false,
      variableOutput: false,
      construction: { kind: 'hmac', hash: 'sha512:sha-512/256' },
    });
    expect(fn.keySizes.max).toBeUndefined();
  });

  it('throws a RangeError for a customization or an output length, in mac and create', () => {
    const key = Uint8Array.of(1);
    for (const options of [{ customization: Uint8Array.of(0x53) }, { customization: new Uint8Array(0) }, { outputLength: 32 }]) {
      expect(() => fn.mac(key, key, options)).toThrow(RangeError);
      expect(() => fn.create(key, options)).toThrow(RangeError);
    }
  });

  it('accepts empty options', () => {
    expect(fn.mac(Uint8Array.of(1), Uint8Array.of(2), {})).toEqual(fn.mac(Uint8Array.of(1), Uint8Array.of(2)));
  });
});

/** A deterministic message of `length` bytes. */
const message = (length: number) => Uint8Array.from({ length }, (_, index) => (index * 31 + 7) & 0xff);

describe.each(HMAC_HASHES.map((hash) => [hash.id, hash] as const))('hmacFunction contexts: %s', (_, hash) => {
  const fn = hmacFunction(hash, `test:${hash.id}`, `hmac-${hash.id}`);
  const key = message(hash.blockSize + 9);
  const data = message(2 * hash.blockSize + 3);
  const oneShot = hex(fn.mac(key, data));

  it('equals the one-shot tag over any split of the message', () => {
    for (const split of [0, 1, hash.blockSize - 1, hash.blockSize, hash.blockSize + 1, data.length]) {
      const context = fn.create(key);
      context.update(data.subarray(0, split));
      context.update(data.subarray(split));
      expect(hex(context.mac())).toBe(oneShot);
    }
  });

  it('gives the same tag from mac() twice and keeps absorbing afterwards', () => {
    const context = fn.create(key);
    context.update(data.subarray(0, 5));
    const first = hex(context.mac());
    expect(hex(context.mac())).toBe(first);
    context.update(data.subarray(5));
    expect(hex(context.mac())).toBe(oneShot);
  });

  it('clones independently both ways', () => {
    const context = fn.create(key);
    context.update(data.subarray(0, 7));
    const copy = context.clone();
    copy.update(data.subarray(7));
    expect(hex(copy.mac())).toBe(oneShot);
    expect(hex(context.mac())).toBe(hex(fn.mac(key, data.subarray(0, 7))));
    context.update(Uint8Array.of(1));
    expect(hex(copy.mac())).toBe(oneShot);
  });

  it('clones the keyed midstates without the key (the key buffer may change afterwards)', () => {
    const mutableKey = key.slice();
    const keyed = fn.create(mutableKey);
    mutableKey.fill(0);
    const copy = keyed.clone();
    copy.update(data);
    expect(hex(copy.mac())).toBe(oneShot);
  });

  it('does not mutate key or data', () => {
    const keyBefore = hex(key);
    const dataBefore = hex(data);
    fn.mac(key, data);
    expect([hex(key), hex(data)]).toEqual([keyBefore, dataBefore]);
  });

  it('hashes a key longer than B: HMAC(K) = HMAC(H(K)), and keys differing after byte B give different tags', () => {
    expect(hex(fn.mac(hash.hash(key), data))).toBe(oneShot);
    const other = key.slice();
    other[hash.blockSize + 1]! ^= 1;
    expect(hex(fn.mac(other, data))).not.toBe(oneShot);
  });

  it('treats a short key and its zero-padded B-byte form alike', () => {
    const short = message(5);
    const padded = new Uint8Array(hash.blockSize);
    padded.set(short);
    expect(hex(fn.mac(short, data))).toBe(hex(fn.mac(padded, data)));
  });
});
