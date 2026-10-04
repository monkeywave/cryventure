import { describe, expect, it } from 'vitest';
import { blake2Blocks } from './blocks.ts';

const bytes = (length: number) => Array.from({ length }, (_, index) => index + 1);

describe('blake2Blocks (RFC 7693 §3.3)', () => {
  it('the empty unkeyed message is one all-zero final block with t = 0', () => {
    expect(blake2Blocks([], [], 64)).toEqual([{ bytes: new Array(64).fill(0), source: 'empty', messageOffset: 0, messageLength: 0, t: 0, last: true }]);
  });

  it('zero-pads the last message block; t counts the message bytes', () => {
    const blocks = blake2Blocks(bytes(70), [], 64);
    expect(blocks.map(({ source, messageOffset, messageLength, t, last }) => [source, messageOffset, messageLength, t, last])).toEqual([
      ['message', 0, 64, 64, false],
      ['message', 64, 6, 70, true],
    ]);
    expect(blocks[1]!.bytes.slice(5, 8)).toEqual([70, 0, 0]);
  });

  it('a full last block is not followed by an empty block', () => {
    expect(blake2Blocks(bytes(128), [], 128)).toHaveLength(1);
  });

  it('a key becomes block 0, zero-padded and counted as a full block', () => {
    const blocks = blake2Blocks(bytes(3), [0xaa, 0xbb], 64);
    expect(blocks.map(({ source, t, last }) => [source, t, last])).toEqual([
      ['key', 64, false],
      ['message', 67, true],
    ]);
    expect(blocks[0]!.bytes.slice(0, 3)).toEqual([0xaa, 0xbb, 0]);
    expect(blocks[1]!.messageOffset).toBe(0);
  });

  it('a keyed empty message is the key block alone, final with t = blockBytes', () => {
    expect(blake2Blocks([], [1], 128).map(({ source, t, last }) => [source, t, last])).toEqual([['key', 128, true]]);
  });
});
