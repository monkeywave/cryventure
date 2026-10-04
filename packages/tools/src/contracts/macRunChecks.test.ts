import { parseHexToArray, toHex, type HashFamily, type HashFunction, type MacConstruction, type MacFamily, type MacFunction } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { checksMacLab, hmacLabParams, macLabKey, macLabKeyLengths, macLabProblems, MAC_LAB_MESSAGE_LENGTHS, type HmacLabRunner } from './macRunChecks.ts';

/** Toy hash: XOR-folds the input into 4 bytes, salted by `salt`. */
function toyHash(id: string, salt: number): HashFunction {
  return {
    id,
    blockSize: 8,
    outputSize: 4,
    hash: (data) => {
      const digest = new Uint8Array(4).fill((data.length + salt) & 0xff);
      data.forEach((byte, i) => { digest[i % 4]! ^= byte; });
      return digest;
    },
    create: () => {
      throw new Error('toy: hash() only');
    },
  };
}

const hashes: HashFamily = { id: 'toy', functions: [toyHash('toy-a', 1), toyHash('toy-b', 2)] };

/** Toy "HMAC": the toy hash over key ‖ data. */
const toyMacOf = (hashId: string) => (key: Uint8Array, data: Uint8Array) => hashes.functions.find((fn) => fn.id === hashId)!.hash(Uint8Array.from([...key, ...data]));

function toyMac(id: string, construction: MacConstruction, hashId = 'toy-a'): MacFunction {
  return {
    id,
    outputSize: 4,
    blockSize: 8,
    keySizes: { min: 0 },
    customizable: false,
    variableOutput: false,
    construction,
    mac: toyMacOf(hashId),
    create: () => {
      throw new Error('toy: mac() only');
    },
  };
}

const macs: MacFamily = { id: 'toy', functions: [toyMac('hmac-a', { kind: 'hmac', hash: 'toy:toy-a' }), toyMac('hmac-b', { kind: 'hmac', hash: 'toy:toy-b' }, 'toy-b')] };

/** An honest lab: computes the toy MAC of the hash its `hash` param names. */
const honestLab: HmacLabRunner = (params) => ({ tag: Array.from(toyMacOf(params['hash']!.split(':')[1]!)(Uint8Array.from(parseHexToArray(params['key']!)), Uint8Array.from(parseHexToArray(params['input']!)))) });

describe('checksMacLab', () => {
  it('applies to producers implementing both Hash and Mac only', () => {
    expect(checksMacLab({ implements: ['Hash', 'Mac'] })).toBe(true);
    expect(checksMacLab({ implements: ['Mac'] })).toBe(false);
    expect(checksMacLab({ implements: ['Hash'] })).toBe(false);
  });
});

describe('hmacLabParams and the fixed inputs', () => {
  it('builds hex lab params with a full tag and nothing to verify', () => {
    expect(hmacLabParams('toy:toy-a', Uint8Array.of(1, 2), Uint8Array.of(0xff))).toEqual({ hash: 'toy:toy-a', key: '0102', encoding: 'hex', input: 'ff', tagLength: 'full', expected: '' });
  });

  it('uses empty, short, one-block and longer-than-block keys', () => {
    expect(macLabKeyLengths(64)).toEqual([0, 20, 64, 65]);
    expect(toHex(macLabKey(3))).toBe('05121f');
  });
});

describe('macLabProblems', () => {
  it('runs every HMAC member over every key and message length and passes an honest lab', () => {
    const seen: string[] = [];
    const recording: HmacLabRunner = (params) => {
      seen.push(params['hash']!);
      return honestLab(params);
    };
    expect(macLabProblems('toy', hashes, macs, recording)).toEqual([]);
    expect(seen).toHaveLength(2 * macLabKeyLengths(8).length * MAC_LAB_MESSAGE_LENGTHS.length);
  });

  it('reports a lab tag the Mac member does not reproduce', () => {
    const lying: HmacLabRunner = (params) => honestLab({ ...params, hash: 'toy:toy-b' });
    const problems = macLabProblems('toy', hashes, { id: 'toy', functions: [macs.functions[0]!] }, lying, [0]);
    expect(problems).toHaveLength(macLabKeyLengths(8).length);
    expect(problems[0]).toMatch(/^"hmac-a" with a 0-byte key over 0 bytes: lab tag [0-9a-f]{8}, but the Mac port gives [0-9a-f]{8}$/);
  });

  it('reports an HMAC member built on a hash that is not one of the producer\'s Hash members', () => {
    const foreign: MacFamily = { id: 'toy', functions: [toyMac('hmac-x', { kind: 'hmac', hash: 'other:toy-a' }), toyMac('hmac-y', { kind: 'hmac', hash: 'toy:toy-z' }), toyMac('hmac-z', { kind: 'hmac', hash: 'malformed' })] };
    expect(macLabProblems('toy', hashes, foreign, honestLab)).toEqual([
      '"hmac-x": construction.hash "other:toy-a" is not one of this producer\'s Hash members',
      '"hmac-y": construction.hash "toy:toy-z" is not one of this producer\'s Hash members',
      '"hmac-z": construction.hash "malformed" is not one of this producer\'s Hash members',
    ]);
  });

  it('skips non-HMAC members (keyed BLAKE2, KMAC)', () => {
    const keyed: MacFamily = { id: 'toy', functions: [toyMac('keyed', { kind: 'keyed-hash' }), toyMac('kmac', { kind: 'kmac' })] };
    expect(macLabProblems('toy', hashes, keyed, () => 'never run')).toEqual([]);
  });

  it('reports a rejected run and a missing tag', () => {
    const one: MacFamily = { id: 'toy', functions: [macs.functions[0]!] };
    expect(macLabProblems('toy', hashes, one, () => 'run() rejected params', [3])[0]).toBe('"hmac-a" with a 0-byte key over 3 bytes: run() rejected params');
    expect(macLabProblems('toy', hashes, one, () => ({}), [3])[0]).toBe('"hmac-a" with a 0-byte key over 3 bytes: run has no "tag" output');
  });
});
