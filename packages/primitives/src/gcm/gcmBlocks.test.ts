import { toHex } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { j0GhashInputs, lengthBlock, paddedBlocks, tagGhashInputs } from './gcmBlocks.ts';

const bytes = (length: number, start = 1) => Array.from({ length }, (_, index) => (start + index) & 0xff);

describe('paddedBlocks', () => {
  it('returns no blocks for empty data', () => {
    expect(paddedBlocks([], 'aad')).toEqual([]);
  });

  it('splits into 16-byte blocks and zero-pads the last one, keeping the unpadded data', () => {
    const blocks = paddedBlocks(bytes(20), 'ciphertext');
    expect(blocks.map((block) => [block.source, block.index, block.data.length, block.block.length])).toEqual([
      ['ciphertext', 0, 16, 16],
      ['ciphertext', 1, 4, 16],
    ]);
    expect(blocks[1]?.block).toEqual([17, 18, 19, 20, ...new Array<number>(12).fill(0)]);
  });

  it('adds no padding to block-aligned data', () => {
    expect(paddedBlocks(bytes(32), 'iv').map((block) => block.data)).toEqual([bytes(16), bytes(16, 17)]);
  });
});

describe('lengthBlock', () => {
  it('encodes both lengths in bits as 64-bit big-endian integers', () => {
    expect(toHex(lengthBlock(20, 60))).toBe('00000000000000a000000000000001e0');
    expect(toHex(lengthBlock(0, 0))).toBe('0'.repeat(32));
  });
});

describe('j0GhashInputs', () => {
  it('is IV ‖ 0^(s+64) ‖ [len(IV)]₆₄ (McGrew–Viega TC 5, an 8-byte IV)', () => {
    const inputs = j0GhashInputs(bytes(8));
    expect(inputs.map((input) => input.source)).toEqual(['iv', 'ivLength']);
    expect(toHex(inputs[0]!.block)).toBe('0102030405060708' + '0'.repeat(16));
    expect(toHex(inputs[1]!.block)).toBe('0'.repeat(16) + '0000000000000040');
    expect(inputs[1]?.data).toEqual([]);
  });

  it('needs four IV blocks and the length block for a 60-byte IV', () => {
    expect(j0GhashInputs(bytes(60)).map((input) => input.source)).toEqual(['iv', 'iv', 'iv', 'iv', 'ivLength']);
  });
});

describe('tagGhashInputs', () => {
  it('absorbs AAD blocks, then ciphertext blocks, then the length block', () => {
    const inputs = tagGhashInputs(bytes(20), bytes(17));
    expect(inputs.map((input) => `${input.source}${input.index}`)).toEqual(['aad0', 'aad1', 'ciphertext0', 'ciphertext1', 'length0']);
    expect(inputs[4]?.block).toEqual(lengthBlock(20, 17));
  });

  it('is only the length block for empty AAD and ciphertext', () => {
    expect(tagGhashInputs([], [])).toEqual([{ source: 'length', index: 0, data: [], block: new Array<number>(16).fill(0) }]);
  });
});
