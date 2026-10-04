import { toHex } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { DOMAIN_SUFFIXES, domainByte, padTail, spongePad } from './padding.ts';

describe('domain suffixes (FIPS 202 §6.1–6.2, B.2; SP 800-185 §3.3)', () => {
  it('give the first padding bytes 06 (SHA3), 1f (SHAKE), 04 (cSHAKE), 01 (Keccak)', () => {
    expect([DOMAIN_SUFFIXES.sha3, DOMAIN_SUFFIXES.shake, DOMAIN_SUFFIXES.cshake, DOMAIN_SUFFIXES.keccak].map(domainByte)).toEqual([0x06, 0x1f, 0x04, 0x01]);
  });
});

describe('padTail (pad10*1)', () => {
  it('fills the rest of the rate block: domain byte, zeros, 80', () => {
    const tail = padTail(3, 136, DOMAIN_SUFFIXES.sha3);
    expect(tail.length).toBe(133);
    expect([tail[0], tail[1], tail[131], tail[132]]).toEqual([0x06, 0, 0, 0x80]);
  });

  it('merges both ends into one byte when one byte is left (06 | 80 = 86)', () => {
    expect(toHex(padTail(135, 136, DOMAIN_SUFFIXES.sha3))).toBe('86');
    expect(toHex(padTail(167, 168, DOMAIN_SUFFIXES.shake))).toBe('9f');
  });

  it('adds a whole block for a message of whole blocks', () => {
    expect(padTail(136, 136, DOMAIN_SUFFIXES.keccak).length).toBe(136);
    expect(padTail(0, 72, DOMAIN_SUFFIXES.sha3).length).toBe(72);
  });
});

describe('spongePad', () => {
  it('pads the empty SHA3-256 message to 06 00 … 00 80 (NIST Msg0)', () => {
    const padding = spongePad(new Uint8Array(0), 136, DOMAIN_SUFFIXES.sha3);
    expect(padding.padded.length).toBe(136);
    expect([padding.padded[0], padding.padded[135]]).toEqual([0x06, 0x80]);
    expect(padding).toMatchObject({ domainByte: 0x06, padBytes: 136, zeroBytes: 134, blocks: 1 });
  });

  it('pads 200 bytes of a3 to two SHA3-256 blocks (NIST 1600-bit example)', () => {
    const padding = spongePad(new Uint8Array(200).fill(0xa3), 136, DOMAIN_SUFFIXES.sha3);
    expect(padding).toMatchObject({ padBytes: 72, zeroBytes: 70, blocks: 2 });
    expect([padding.padded[199], padding.padded[200], padding.padded[271]]).toEqual([0xa3, 0x06, 0x80]);
  });

  it('reports no zero bytes when one or two padding bytes fit', () => {
    expect(spongePad(new Uint8Array(135), 136, DOMAIN_SUFFIXES.sha3)).toMatchObject({ padBytes: 1, zeroBytes: 0 });
    expect(spongePad(new Uint8Array(134), 136, DOMAIN_SUFFIXES.sha3)).toMatchObject({ padBytes: 2, zeroBytes: 0 });
  });
});
