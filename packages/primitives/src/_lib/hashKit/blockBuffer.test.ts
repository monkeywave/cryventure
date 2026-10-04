import { describe, expect, it } from 'vitest';
import { BlockBuffer } from './blockBuffer.ts';

const bytes = (...values: number[]) => Uint8Array.from(values);

function feedAll(buffer: BlockBuffer, ...chunks: Uint8Array[]): number[][] {
  const blocks: number[][] = [];
  for (const chunk of chunks) buffer.feed(chunk, (block) => blocks.push([...block]));
  return blocks;
}

describe('BlockBuffer', () => {
  it('hands out whole blocks in order across chunk boundaries and keeps the tail', () => {
    const buffer = BlockBuffer.empty(3);
    expect(feedAll(buffer, bytes(1), bytes(2, 3, 4, 5, 6, 7), bytes(), bytes(8))).toEqual([[1, 2, 3], [4, 5, 6]]);
    expect([...buffer.tail]).toEqual([7, 8]);
  });

  it('keeps a partial block below the block size', () => {
    const buffer = BlockBuffer.empty(4);
    expect(feedAll(buffer, bytes(1, 2), bytes(3))).toEqual([]);
    expect([...buffer.tail]).toEqual([1, 2, 3]);
  });

  it('clones independently', () => {
    const buffer = BlockBuffer.empty(4);
    feedAll(buffer, bytes(1, 2));
    const copy = buffer.clone();
    expect(feedAll(buffer, bytes(3, 4))).toEqual([[1, 2, 3, 4]]);
    expect([...copy.tail]).toEqual([1, 2]);
    expect(feedAll(copy, bytes(9, 9))).toEqual([[1, 2, 9, 9]]);
  });
});
