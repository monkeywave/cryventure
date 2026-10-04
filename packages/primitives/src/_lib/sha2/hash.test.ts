import { hashFunction, toHex, utf8Bytes } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { SHA512_224_IV, SHA512_256_IV } from './constants.ts';
import { SHA2_FUNCTIONS, sha2HashFamily, sha512tIv, sha512tIvGenerator } from './hash.ts';

/**
 * FIPS 180-4 / NIST CSRC "Examples with Intermediate Values" digests
 * (https://csrc.nist.gov/projects/cryptographic-standards-and-guidelines/example-values:
 * SHA224.pdf, SHA256.pdf, SHA384.pdf, SHA512.pdf, SHA512_224.pdf, SHA512_256.pdf).
 */
const ABC = 'abc';
/** The 448-bit two-block message of the SHA-224/256 examples. */
const MSG_448 = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
/** The 896-bit two-block message of the SHA-384/512/512-t examples. */
const MSG_896 = 'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu';

const NIST_EXAMPLES: readonly { id: string; message: string; digest: string }[] = [
  { id: 'sha-224', message: ABC, digest: '23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7' },
  { id: 'sha-224', message: MSG_448, digest: '75388b16512776cc5dba5da1fd890150b0c6455cb4f58b1952522525' },
  { id: 'sha-256', message: ABC, digest: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' },
  { id: 'sha-256', message: MSG_448, digest: '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1' },
  { id: 'sha-384', message: ABC, digest: 'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7' },
  { id: 'sha-384', message: MSG_896, digest: '09330c33f71147e83d192fc782cd1b4753111b173b3b05d22fa08086e3b0f712fcc7c71a557e2db966c3e9fa91746039' },
  { id: 'sha-512', message: ABC, digest: 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f' },
  { id: 'sha-512', message: MSG_896, digest: '8e959b75dae313da8cf4f72814fc143f8f7779c6eb9f7fa17299aeadb6889018501d289e4900f7e4331b99dec4b5433ac7d329eeb6dd26545e96e55b874be909' },
  { id: 'sha-512/224', message: ABC, digest: '4634270f707b6a54daae7530460842e20e37ed265ceee9a43e8924aa' },
  { id: 'sha-512/224', message: MSG_896, digest: '23fec5bb94d60b23308192640b0c453335d664734fe40e7268674af9' },
  { id: 'sha-512/256', message: ABC, digest: '53048e2681941ef99b2e29b76b4c7dabe4c2d0c634fc6d46e0e2f13107e7af23' },
  { id: 'sha-512/256', message: MSG_896, digest: '3928e184fb8690f840da3988121d31be65cb9d3ef83ee6146feac861e19b563a' },
];

const family = { id: 'all', functions: SHA2_FUNCTIONS };

describe('SHA2_FUNCTIONS (untraced reference)', () => {
  it.each(NIST_EXAMPLES)('$id of a $message.length-byte message matches the NIST example', ({ id, message, digest }) => {
    expect(toHex(hashFunction(family, id)!.hash(utf8Bytes(message)))).toBe(digest);
  });

  it('declares the FIPS block and output sizes', () => {
    expect(SHA2_FUNCTIONS.map((fn) => [fn.id, fn.blockSize, fn.outputSize])).toEqual([
      ['sha-224', 64, 28],
      ['sha-256', 64, 32],
      ['sha-384', 128, 48],
      ['sha-512', 128, 64],
      ['sha-512/224', 128, 28],
      ['sha-512/256', 128, 32],
    ]);
  });

  it('builds a family from a subset of the functions', () => {
    expect(sha2HashFamily('sha256', ['sha-224', 'sha-256'])).toEqual({ id: 'sha256', functions: SHA2_FUNCTIONS.slice(0, 2) });
  });
});

describe('sha512tIv (FIPS 180-4 §5.3.6)', () => {
  it('reproduces the SHA-512/224 IV of §5.3.6.1', () => {
    expect(sha512tIv(224)).toEqual(SHA512_224_IV);
  });

  it('reproduces the SHA-512/256 IV of §5.3.6.2', () => {
    expect(sha512tIv(256)).toEqual(SHA512_256_IV);
  });

  it('is the generator over the ASCII string "SHA-512/t"', () => {
    const digest = sha512tIvGenerator(utf8Bytes('SHA-512/256'));
    expect(toHex(digest.subarray(0, 8))).toBe('22312194fc2bf72c');
  });

  it.each([0, 384, 512, 1.5])('rejects t = %s', (t) => {
    expect(() => sha512tIv(t)).toThrow(RangeError);
  });
});
