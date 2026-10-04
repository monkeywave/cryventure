import type { BlockCipher, HashFamily, HashFunction, ParamField, PrimitiveManifest } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { blockCipherProblems, hashFamilyProblems, implementedPortProblems, portFieldProblems, runInProblems, textFieldProblems } from './portChecks.ts';

/** 4-byte toy cipher: E(k, b) = b ⊕ k, with the length checks a real port must have. */
function toyCipher(overrides: Partial<BlockCipher> = {}): BlockCipher {
  const xor = (key: Uint8Array, block: Uint8Array): Uint8Array => {
    if (key.length !== 4 || block.length !== 4) throw new RangeError('toy: wrong length');
    return block.map((byte, i) => byte ^ (key[i] ?? 0));
  };
  return { id: 'toy', blockSize: 4, keySizes: [4], encryptBlock: xor, decryptBlock: xor, ...overrides };
}

describe('blockCipherProblems', () => {
  it('passes a sane cipher', () => expect(blockCipherProblems(toyCipher(), 'toy')).toEqual([]));

  it('reports a foreign id and bad sizes', () => {
    expect(blockCipherProblems(toyCipher({ id: 'aes' }), 'toy')).toEqual(['BlockCipher: id "aes" is not the producer id "toy"']);
    expect(blockCipherProblems(toyCipher({ blockSize: 0 }), 'toy')[0]).toBe('BlockCipher: blockSize 0 is not a positive integer');
    expect(blockCipherProblems(toyCipher({ keySizes: [] }), 'toy')).toEqual(['BlockCipher: keySizes is empty']);
  });

  it('reports a broken round trip', () => {
    const broken = toyCipher({ decryptBlock: (key, block) => toyCipher().decryptBlock(key, block).map((byte) => byte ^ 1) });
    expect(blockCipherProblems(broken, 'toy')).toEqual(['BlockCipher: decrypt(encrypt(block)) differs from block for a 4-byte key']);
  });

  it('reports wrong lengths that do not throw', () => {
    const lenient = toyCipher({ encryptBlock: (_key, block) => block, decryptBlock: (_key, block) => block });
    expect(blockCipherProblems(lenient, 'toy')).toEqual([
      'BlockCipher: encryptBlock accepts a 1-byte key',
      'BlockCipher: decryptBlock accepts a 1-byte key',
      'BlockCipher: encryptBlock accepts a 5-byte block',
      'BlockCipher: decryptBlock accepts a 5-byte block',
    ]);
  });

  it('reports a cipher that throws on valid input', () => {
    const throwing = toyCipher({ encryptBlock: () => { throw new Error('boom'); } });
    expect(blockCipherProblems(throwing, 'toy')).toEqual(['BlockCipher: round trip with a 4-byte key threw: boom']);
  });
});

/** Toy hash: folds the input (and its length) into `outputSize` bytes. */
function toyHash(overrides: Partial<HashFunction> = {}): HashFunction {
  const base: HashFunction = {
    id: 'toy-256',
    blockSize: 64,
    outputSize: 32,
    hash(data) {
      const digest = new Uint8Array(this.outputSize).fill(data.length & 0xff);
      data.forEach((byte, i) => { digest[i % digest.length]! ^= byte; });
      return digest;
    },
  };
  return { ...base, ...overrides };
}

const toyFamily = (functions: HashFunction[] = [toyHash(), toyHash({ id: 'toy-224', outputSize: 28 })], id = 'toy'): HashFamily => ({ id, functions });

describe('hashFamilyProblems', () => {
  it('passes a sane family', () => expect(hashFamilyProblems(toyFamily(), 'toy')).toEqual([]));

  it('accepts a 128-byte block', () => expect(hashFamilyProblems(toyFamily([toyHash({ id: 'toy-512', blockSize: 128, outputSize: 64 })]), 'toy')).toEqual([]));

  it('reports a family id that is not the producer id', () => {
    expect(hashFamilyProblems(toyFamily(undefined, 'sha256'), 'toy')).toEqual(['Hash: family id "sha256" is not the producer id "toy"']);
  });

  it('reports an empty family', () => expect(hashFamilyProblems(toyFamily([]), 'toy')).toEqual(['Hash: functions is empty']));

  it('reports duplicate function ids', () => {
    expect(hashFamilyProblems(toyFamily([toyHash(), toyHash(), toyHash()]), 'toy')).toEqual(['Hash: function id "toy-256" is not unique']);
  });

  it('reports a block size other than 64 or 128', () => {
    expect(hashFamilyProblems(toyFamily([toyHash({ blockSize: 32 })]), 'toy')).toEqual(['Hash toy-256: blockSize 32 is not 64 or 128']);
  });

  it('reports a bad output size', () => {
    expect(hashFamilyProblems(toyFamily([toyHash({ outputSize: 0 })]), 'toy')).toEqual(['Hash toy-256: outputSize 0 is not a positive integer']);
  });

  it('reports digests of the wrong length, per input length', () => {
    const short = toyHash({ hash: (data) => new Uint8Array(data.length === 1 ? 31 : 32) });
    expect(hashFamilyProblems(toyFamily([short]), 'toy')).toEqual(['Hash toy-256: 1-byte input: digest is not 32 bytes']);
    const blockOnly = toyHash({ hash: (data) => new Uint8Array(data.length === 64 ? 16 : 32) });
    expect(hashFamilyProblems(toyFamily([blockOnly]), 'toy')).toEqual(['Hash toy-256: 64-byte input: digest is not 32 bytes']);
  });

  it('reports a non-deterministic function', () => {
    let calls = 0;
    const drifting = toyHash({ hash: () => new Uint8Array(32).fill(calls++) });
    expect(hashFamilyProblems(toyFamily([drifting]), 'toy')).toEqual([
      'Hash toy-256: 0-byte input: hash is not deterministic',
      'Hash toy-256: 1-byte input: hash is not deterministic',
      'Hash toy-256: 64-byte input: hash is not deterministic',
    ]);
  });

  it('reports a function that throws', () => {
    const throwing = toyHash({ hash: (data) => { if (data.length === 0) throw new Error('empty'); return new Uint8Array(32); } });
    expect(hashFamilyProblems(toyFamily([throwing]), 'toy')).toEqual(['Hash toy-256: 0-byte input threw: empty']);
  });

  it('reports a function whose digests of the 0-, 1- and block-sized inputs collide', () => {
    const constant = toyHash({ hash: () => new Uint8Array(32) });
    expect(hashFamilyProblems(toyFamily([constant]), 'toy')).toEqual([
      'Hash toy-256: 0-byte and 1-byte inputs have the same digest',
      'Hash toy-256: 0-byte and 64-byte inputs have the same digest',
      'Hash toy-256: 1-byte and 64-byte inputs have the same digest',
    ]);
    const lengthOnly = toyHash({ hash: (data) => new Uint8Array(32).fill(data.length === 1 ? 1 : 0) });
    expect(hashFamilyProblems(toyFamily([lengthOnly]), 'toy')).toEqual(['Hash toy-256: 0-byte and 64-byte inputs have the same digest']);
  });

  it('reports a function that mutates its input', () => {
    const mutating = toyHash({ hash(data) { const digest = toyHash().hash(data); data.fill(0xaa); return digest; } });
    expect(hashFamilyProblems(toyFamily([mutating]), 'toy')).toEqual(['Hash toy-256: 1-byte input: hash mutates its input', 'Hash toy-256: 64-byte input: hash mutates its input']);
  });

  it('is the sanity check implementedPortProblems runs for Hash', () => {
    expect(implementedPortProblems({ id: 'toy', implements: ['Hash'] }, { ports: { Hash: toyFamily() } })).toEqual([]);
    expect(implementedPortProblems({ id: 'other', implements: ['Hash'] }, { ports: { Hash: toyFamily() } })).toEqual(['Hash: family id "toy" is not the producer id "other"']);
  });
});

describe('implementedPortProblems', () => {
  it('passes when every declared port is exposed and sane', () => {
    expect(implementedPortProblems({ id: 'toy', implements: ['BlockCipher'] }, { ports: { BlockCipher: toyCipher() } })).toEqual([]);
  });

  it('reports a declared port missing from the module', () => {
    expect(implementedPortProblems({ id: 'toy', implements: ['BlockCipher'] }, {})).toEqual(['port "BlockCipher" is declared in implements but missing from module.ports']);
  });

  it('reports unknown port names', () => {
    expect(implementedPortProblems({ id: 'toy', implements: ['Nope' as never] }, {})).toEqual(['implements: "Nope" is not a port name']);
  });
});

const producer = (id: string, ports: PrimitiveManifest['implements']) => ({ id, implements: ports }) as PrimitiveManifest;

describe('portFieldProblems', () => {
  const cipher: ParamField = { name: 'cipher', labelKey: 'k', kind: 'port', port: 'BlockCipher' };

  it('passes when a registered producer implements the port', () => {
    expect(portFieldProblems([cipher], [producer('aes', ['BlockCipher'])])).toEqual([]);
  });

  it('reports ports nobody implements and invalid port names', () => {
    expect(portFieldProblems([cipher], [producer('xor', [])])).toEqual(['param "cipher": no registered producer implements port "BlockCipher"']);
    expect(portFieldProblems([{ ...cipher, port: 'Nope' as never }], [])).toEqual(['param "cipher": "Nope" is not a port name']);
    expect(portFieldProblems([{ ...cipher, port: undefined }], [])).toEqual(['param "cipher": "undefined" is not a port name']);
  });

  it('ignores other field kinds', () => expect(portFieldProblems([{ name: 'keyHex', labelKey: 'k', kind: 'hex' }], [])).toEqual([]));
});

describe('textFieldProblems', () => {
  const message: ParamField = { name: 'message', labelKey: 'k', kind: 'text', maxLength: 4 };

  it('passes text values within maxLength', () => {
    expect(textFieldProblems([message], [{ name: 'defaults', params: { message: 'abcd' } }])).toEqual([]);
  });

  it('reports a bad maxLength and values that do not fit', () => {
    expect(textFieldProblems([{ ...message, maxLength: 0 }], [])).toEqual(['param "message": maxLength 0 is not a positive integer']);
    expect(textFieldProblems([message], [{ name: 'defaults', params: { message: 'abcde' } }, { name: 'preset x', params: { message: 3 } }])).toEqual([
      'defaults: param "message" is not a string of at most 4 UTF-8 bytes',
      'preset x: param "message" is not a string of at most 4 UTF-8 bytes',
    ]);
  });
});

describe('runInProblems', () => {
  it('accepts no flag, main and worker', () => {
    expect(runInProblems({})).toEqual([]);
    expect(runInProblems({ runIn: 'main' })).toEqual([]);
    expect(runInProblems({ runIn: 'worker' })).toEqual([]);
  });

  it('reports anything else', () => expect(runInProblems({ runIn: 'gpu' as never })).toEqual(['runIn "gpu" is not "main" or "worker"']));
});
