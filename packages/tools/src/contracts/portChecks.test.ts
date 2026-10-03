import type { BlockCipher, ParamField, PrimitiveManifest } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { blockCipherProblems, implementedPortProblems, portFieldProblems, runInProblems, textFieldProblems } from './portChecks.ts';

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
