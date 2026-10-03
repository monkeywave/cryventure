import { describe, expect, it } from 'vitest';
import type { PortResolver } from '../plugin/ports.ts';
import { assertMatchesReference, blockCount, blockModeOutputs, blockIndices, blockLengthError, alignmentError, prepareBlockCipher, readBlockParamHex, readModeCommon } from './modeKit.ts';
import { toyCipher } from './testCiphers.ts';

const NS = 'plugin.demo';
const resolveToy: PortResolver = ((port: string, id: string) => (port === 'BlockCipher' && id === 'toy' ? toyCipher : undefined)) as PortResolver;

describe('readModeCommon', () => {
  const valid = { cipher: 'aes', keyHex: 'AA BB', inputHex: '01:02' };

  it('normalises the cipher id, key and input', () => {
    expect(readModeCommon(valid, NS)).toEqual({ ok: true, value: { cipher: 'aes', keyHex: 'aabb', inputHex: '0102' } });
  });

  it.each([
    [{ ...valid, cipher: 'AES' }, { key: `${NS}.error.cipher` }],
    [{ ...valid, cipher: 3 }, { key: `${NS}.error.cipher` }],
    [{ ...valid, keyHex: '' }, { key: `${NS}.error.keyLength`, params: { length: 0 } }],
    [{ ...valid, keyHex: '00'.repeat(65) }, { key: `${NS}.error.keyLength`, params: { length: 65 } }],
    [{ ...valid, inputHex: '' }, { key: `${NS}.error.inputLength`, params: { length: 0 } }],
    [{ ...valid, inputHex: '00'.repeat(65) }, { key: `${NS}.error.inputLength`, params: { length: 65 } }],
    [{ ...valid, inputHex: 7 }, { key: `${NS}.error.invalidParams` }],
  ])('rejects %j', (params, error) => {
    expect(readModeCommon(params, NS)).toEqual({ ok: false, error });
  });
});

describe('readBlockParamHex', () => {
  it('accepts 1..32 bytes and reports other lengths with the given key', () => {
    expect(readBlockParamHex('0F', NS, 'k')).toEqual({ ok: true, bytes: Uint8Array.of(15), hex: '0f' });
    expect(readBlockParamHex('00'.repeat(33), NS, 'k')).toEqual({ ok: false, error: { key: 'k', params: { length: 33 } } });
  });
});

describe('prepareBlockCipher', () => {
  it('resolves the cipher and decodes the key', () => {
    const prepared = prepareBlockCipher(resolveToy, 'toy', '10203040');
    expect(prepared.ok && prepared.cipher).toBe(toyCipher);
    expect(prepared.ok && [...prepared.key]).toEqual([0x10, 0x20, 0x30, 0x40]);
  });

  it('passes a failed module load through as core.error.portLoadFailed', () => {
    const failed = Object.assign(() => undefined, { failed: () => true }) as unknown as PortResolver;
    expect(prepareBlockCipher(failed, 'aes', '10203040')).toEqual({ ok: false, error: { key: 'core.error.portLoadFailed', params: { id: 'aes' } } });
  });

  it('reports a missing port and a wrong key length as run errors', () => {
    expect(prepareBlockCipher(resolveToy, 'aes', '10203040')).toEqual({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'aes' } } });
    expect(prepareBlockCipher(undefined, 'toy', '10203040')).toEqual({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'toy' } } });
    expect(prepareBlockCipher(resolveToy, 'toy', '10')).toEqual({ ok: false, error: { key: 'core.error.keyLength', params: { sizes: '4' } } });
  });
});

describe('block length checks', () => {
  it('blockLengthError wants exactly one block', () => {
    expect(blockLengthError(toyCipher, 4, 'k')).toBeUndefined();
    expect(blockLengthError(toyCipher, 3, 'k')).toEqual({ key: 'k', params: { blockSize: 4, length: 3 } });
  });

  it('alignmentError wants whole blocks', () => {
    expect(alignmentError(toyCipher, 8, 'k')).toBeUndefined();
    expect(alignmentError(toyCipher, 6, 'k')).toEqual({ key: 'k', params: { blockSize: 4, length: 6 } });
  });
});

describe('block indexing', () => {
  it('counts partial blocks and lists the byte offsets of one block', () => {
    expect(blockCount(9, 4)).toBe(3);
    expect(blockCount(8, 4)).toBe(2);
    expect(blockIndices(1, 4, 9)).toEqual([4, 5, 6, 7]);
    expect(blockIndices(2, 4, 9)).toEqual([8]);
  });
});

describe('assertMatchesReference', () => {
  it('passes equal bytes and throws on a difference', () => {
    expect(() => assertMatchesReference([1, 2], Uint8Array.of(1, 2), 'cbc')).not.toThrow();
    expect(() => assertMatchesReference([1, 2], [1, 3], 'cbc')).toThrow(/cbc: the traced output differs/);
  });
});

describe('blockModeOutputs', () => {
  it('names the output by direction and padding result', () => {
    expect(blockModeOutputs('encrypt', [1])).toEqual({ ciphertext: [1] });
    expect(blockModeOutputs('decrypt', [1])).toEqual({ plaintext: [1] });
    expect(blockModeOutputs('decrypt', [1, 1], { ok: true, data: Uint8Array.of(1), padLength: 1 })).toEqual({ plaintext: [1] });
    expect(blockModeOutputs('decrypt', [1, 0], { ok: false, reason: 'zero-pad-byte', padLength: 0 })).toEqual({ padded: [1, 0] });
  });
});
