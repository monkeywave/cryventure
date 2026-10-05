import { blockCount, parseHexToArray as bytes, toHex, type MacFunction } from '@cryventure/core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  expandMessage,
  extractSalt,
  hkdfExpand,
  hkdfExpandBlocks,
  hkdfExtract,
  hkdfLabel,
  MAX_BLOCKS,
  maxOutputLength,
  okmOf,
} from './hkdf.ts';
import { macMember } from '../testing/hmacPorts.ts';

/** RFC 5869 A.1 (HKDF-SHA-256). */
const A1 = {
  ikm: '0b'.repeat(22),
  salt: '000102030405060708090a0b0c',
  info: 'f0f1f2f3f4f5f6f7f8f9',
  prk: '077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5',
  okm: '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
};
/** RFC 8448 §3: "tls13 c hs traffic" — printed info (the HkdfLabel), hash and output. */
const C_HS = {
  prk: '1dc826e93606aa6fdc0aadc12f741b01046aa6b99f691ed221a9f0ca043fbeac',
  hash: '860c06edc07858ee8e78f0e7428c58edd6b43f2ca3e6e95f02ed063cf0e1cad8',
  info: '002012746c7331332063206873207472616666696320860c06edc07858ee8e78f0e7428c58edd6b43f2ca3e6e95f02ed063cf0e1cad8',
  secret: 'b3eddb126e067f35a780b3abf45e2d8f3b1a950738f52e9600746a0e27a55a21',
};

let sha256: MacFunction;
let sha1: MacFunction;

beforeAll(async () => {
  [sha256, sha1] = await Promise.all([macMember('sha256:hmac-sha-256'), macMember('sha1:hmac-sha-1')]);
});

describe('extractSalt', () => {
  it('replaces an empty salt by HashLen zero bytes (RFC 5869 §2.2)', () => {
    expect(extractSalt([], 32)).toEqual(new Array(32).fill(0));
    expect(extractSalt([], 20)).toHaveLength(20);
  });

  it('keeps a given salt (as a copy)', () => {
    const salt = [1, 2, 3];
    const result = extractSalt(salt, 32);
    expect(result).toEqual([1, 2, 3]);
    expect(result).not.toBe(salt);
  });
});

describe('hkdfExtract', () => {
  it('reproduces RFC 5869 A.1', () => {
    expect(toHex(hkdfExtract(sha256, bytes(A1.salt), bytes(A1.ikm)))).toBe(A1.prk);
  });

  it('treats an empty salt like HashLen zeros (A.3 = A.3 with explicit zeros)', () => {
    const ikm = bytes(A1.ikm);
    expect(hkdfExtract(sha256, [], ikm)).toEqual(hkdfExtract(sha256, new Array(32).fill(0), ikm));
    expect(toHex(hkdfExtract(sha256, [], ikm))).toBe(
      '19ef24a32c717b167f33a91d6f648bdf96596776afdb6377ac434c1c293ccb04',
    );
  });

  it('uses the MAC output size for the zero salt (A.7, SHA-1)', () => {
    expect(toHex(hkdfExtract(sha1, [], bytes('0c'.repeat(22))))).toBe(
      '2adccada18779e7c2077ad2eb19d3f3e731385dd',
    );
  });
});

describe('block arithmetic', () => {
  it('blockCount is ⌈L / HashLen⌉', () => {
    expect([1, 32, 33, 42, 64, 65].map((length) => blockCount(length, 32))).toEqual([
      1, 1, 2, 2, 2, 3,
    ]);
    expect(blockCount(42, 20)).toBe(3);
  });

  it('maxOutputLength is 255 · HashLen', () => {
    expect(MAX_BLOCKS).toBe(255);
    expect(maxOutputLength(32)).toBe(8160);
    expect(maxOutputLength(16)).toBe(4080);
  });

  it('expandMessage is T(i−1) ‖ info ‖ i', () => {
    expect(expandMessage([], [0xaa], 1)).toEqual([0xaa, 1]);
    expect(expandMessage([7, 8], [], 2)).toEqual([7, 8, 2]);
    expect(expandMessage([7], [0xaa, 0xbb], 3)).toEqual([7, 0xaa, 0xbb, 3]);
  });
});

describe('hkdfExpandBlocks / okmOf / hkdfExpand', () => {
  it('chains the blocks: block i hashes T(i−1) ‖ info ‖ i', () => {
    const prk = bytes(A1.prk);
    const info = bytes(A1.info);
    const blocks = hkdfExpandBlocks(sha256, prk, info, 42);
    expect(blocks.map((block) => block.index)).toEqual([1, 2]);
    expect(blocks[0]!.message).toEqual([...info, 1]);
    expect(blocks[1]!.message).toEqual([...blocks[0]!.t, ...info, 2]);
    blocks.forEach((block) =>
      expect(Array.from(sha256.mac(Uint8Array.from(prk), Uint8Array.from(block.message)))).toEqual(
        block.t,
      ),
    );
  });

  it('OKM is the first L bytes (RFC 5869 A.1, A.4)', () => {
    const blocks = hkdfExpandBlocks(sha256, bytes(A1.prk), bytes(A1.info), 42);
    expect(okmOf(blocks, 42)).toHaveLength(42);
    expect(toHex(okmOf(blocks, 42))).toBe(A1.okm);
    expect(toHex(hkdfExpand(sha256, bytes(A1.prk), bytes(A1.info), 42))).toBe(A1.okm);
    expect(
      toHex(
        hkdfExpand(sha1, bytes('9b6c18c432a7bf8f0e71c8eb88f4b30baa2ba243'), bytes(A1.info), 42),
      ),
    ).toBe('085a01ea1b10f36933068b56efa5ad81a4f14b822f5b091568a9cdd4f155fda2c22e422478d305f3f896');
  });

  it('a shorter L is a prefix of a longer one', () => {
    const long = hkdfExpand(sha256, bytes(A1.prk), [], 64);
    expect(hkdfExpand(sha256, bytes(A1.prk), [], 10)).toEqual(long.slice(0, 10));
    expect(hkdfExpandBlocks(sha256, bytes(A1.prk), [], 32)).toHaveLength(1);
  });
});

describe('hkdfLabel (RFC 8446 §7.1)', () => {
  it('encodes uint16 length ‖ u8 len ‖ "tls13 " ‖ label ‖ u8 len ‖ context byte for byte', () => {
    const struct = hkdfLabel(32, 'c hs traffic', bytes(C_HS.hash));
    expect(toHex(struct.bytes)).toBe(C_HS.info);
    expect(struct.bytes.slice(0, 2)).toEqual([0x00, 0x20]);
    expect(struct.bytes[2]).toBe(18);
    expect(String.fromCharCode(...struct.fullLabel)).toBe('tls13 c hs traffic');
    expect(struct.offsets).toEqual({ labelLength: 2, label: 3, contextLength: 21, context: 22 });
    expect(struct.bytes[struct.offsets.contextLength]).toBe(32);
    expect(struct.bytes.slice(struct.offsets.context)).toEqual(bytes(C_HS.hash));
  });

  it('encodes an empty context as a zero length byte', () => {
    const struct = hkdfLabel(16, 'key', []);
    expect(toHex(struct.bytes)).toBe('001009746c733133206b657900');
    expect(struct.context).toEqual([]);
  });

  it('puts L > 255 into both length bytes', () => {
    expect(hkdfLabel(0x1234, 'x', []).bytes.slice(0, 2)).toEqual([0x12, 0x34]);
  });

  it('feeds Expand to the RFC 8448 traffic secret', () => {
    expect(
      toHex(
        hkdfExpand(
          sha256,
          bytes(C_HS.prk),
          hkdfLabel(32, 'c hs traffic', bytes(C_HS.hash)).bytes,
          32,
        ),
      ),
    ).toBe(C_HS.secret);
  });

  it.each([
    [() => hkdfLabel(0x10000, 'x', []), /uint16/],
    [() => hkdfLabel(-1, 'x', []), /uint16/],
    [() => hkdfLabel(32, 'x'.repeat(250), []), /255/],
    [() => hkdfLabel(32, 'x', new Array(256).fill(0)), /context/],
  ])('throws a RangeError past the limits (%#)', (call, message) => {
    expect(call).toThrow(RangeError);
    expect(call).toThrow(message);
  });

  it('accepts the largest label (249 bytes) and context (255 bytes)', () => {
    expect(hkdfLabel(32, 'x'.repeat(249), new Array(255).fill(1)).bytes).toHaveLength(
      2 + 1 + 255 + 1 + 255,
    );
  });
});

