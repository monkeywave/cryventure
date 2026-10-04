import { parseHexOrThrow, toHex, utf8Bytes, type MacFunction } from '@cryventure/core';
import { beforeAll, describe, expect, it } from 'vitest';
import conformance from './vectors/conformance.json' with { type: 'json' };
import { blockCount, int32be, pbkdf2, pbkdf2Block, prf, saltWithIndex } from './pbkdf2.ts';
import { hmacMember } from './testMacs.ts';

let sha1: MacFunction;
let sha256: MacFunction;

beforeAll(async () => {
  sha1 = await hmacMember('sha1:hmac-sha-1');
  sha256 = await hmacMember('sha256:hmac-sha-256');
});

const ascii = (text: string): Uint8Array => utf8Bytes(text);

describe('int32be and saltWithIndex', () => {
  it('writes INT(i) as four big-endian bytes after the salt', () => {
    expect(toHex(int32be(1))).toBe('00000001');
    expect(toHex(int32be(0x01020304))).toBe('01020304');
    expect(toHex(saltWithIndex(ascii('salt'), 2))).toBe('73616c7400000002');
    expect(toHex(saltWithIndex(new Uint8Array(0), 1))).toBe('00000001');
  });
});

describe('blockCount', () => {
  it('is ⌈dkLen / hLen⌉', () => {
    expect([blockCount(20, 20), blockCount(21, 20), blockCount(25, 20), blockCount(1, 64), blockCount(128, 16)]).toEqual([1, 2, 2, 1, 8]);
  });
});

describe('prf', () => {
  it('equals the one-shot HMAC and leaves the keyed context unchanged', () => {
    const keyed = sha256.create(ascii('key'));
    const first = toHex(prf(keyed, ascii('a')));
    expect(first).toBe(toHex(sha256.mac(ascii('key'), ascii('a'))));
    expect(toHex(prf(keyed, ascii('a')))).toBe(first);
  });
});

describe('pbkdf2Block', () => {
  it('visits every iteration with U_j and the running F = U₁ ⊕ … ⊕ U_j', () => {
    const keyed = sha1.create(ascii('password'));
    const seen: { j: number; u: string; f: string }[] = [];
    const f = pbkdf2Block(keyed, ascii('salt'), 1, 3, (j, u, running) => seen.push({ j, u: toHex(u), f: toHex(running) }));
    const u1 = sha1.mac(ascii('password'), saltWithIndex(ascii('salt'), 1));
    const u2 = sha1.mac(ascii('password'), u1);
    const u3 = sha1.mac(ascii('password'), u2);
    const xor = (a: Uint8Array, b: Uint8Array) => a.map((byte, k) => byte ^ b[k]!);
    expect(seen).toEqual([
      { j: 1, u: toHex(u1), f: toHex(u1) },
      { j: 2, u: toHex(u2), f: toHex(xor(u1, u2)) },
      { j: 3, u: toHex(u3), f: toHex(xor(xor(u1, u2), u3)) },
    ]);
    expect(toHex(f)).toBe(seen[2]!.f);
  });
});

describe('pbkdf2', () => {
  it.each(conformance.cases.map((testCase) => [testCase.name, testCase] as const))('reproduces %s through the Mac port', (_name, testCase) => {
    const mac = testCase.params.mac === 'sha1:hmac-sha-1' ? sha1 : sha256;
    const { password, salt, iterations, length } = testCase.params;
    expect(toHex(pbkdf2(mac, parseHexOrThrow(password), parseHexOrThrow(salt), Number(iterations), Number(length)))).toBe(testCase.outputs.dk);
  });

  it('keys the MAC once and clones it per call (the midstate trick)', () => {
    let creates = 0;
    let clones = 0;
    const counting: MacFunction = {
      ...sha1,
      create(key, options) {
        creates++;
        const wrap = (context: ReturnType<MacFunction['create']>): ReturnType<MacFunction['create']> => ({
          update: (data) => context.update(data),
          mac: () => context.mac(),
          clone: () => {
            clones++;
            return wrap(context.clone());
          },
        });
        return wrap(sha1.create(key, options));
      },
    };
    pbkdf2(counting, ascii('password'), ascii('salt'), 10, 25);
    expect(creates).toBe(1);
    expect(clones).toBe(2 * 10);
  });
});
