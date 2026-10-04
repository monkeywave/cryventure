import { describe, expect, it } from 'vitest';
import { squeezeSizes, spongeRegions, spongeScopeLevels } from './spongeRecording.ts';

describe('spongeRegions', () => {
  it('lists padded, A and output in the given namespace; A as 25 little-endian 8-byte lanes, five per row', () => {
    const regions = spongeRegions('plugin.kmac', 168, 32);
    expect(regions.map((region) => [region.id, region.labelKey, region.shape[0], region.initial])).toEqual([
      ['padded', 'plugin.kmac.region.padded', 168, 'blank'],
      ['A', 'plugin.kmac.region.A', 200, undefined],
      ['output', 'plugin.kmac.region.output', 32, 'blank'],
    ]);
    expect(regions[1]!.layout).toEqual({ kind: 'words', wordBytes: 8, labelPrefix: 'A', wordsPerGroup: 5, byteOrder: 'little' });
  });
});

describe('spongeScopeLevels', () => {
  it('has block, round and op levels at mapping detail, block and op otherwise', () => {
    expect(spongeScopeLevels('plugin.sha3', 'mapping').map((level) => level.labelKey)).toEqual(['plugin.sha3.scope.block', 'plugin.sha3.scope.round', 'plugin.sha3.scope.op']);
    expect(spongeScopeLevels('plugin.kmac', 'permutation').map((level) => level.labelKey)).toEqual(['plugin.kmac.scope.block', 'plugin.kmac.scope.op']);
  });
});

describe('squeezeSizes', () => {
  it('takes whole rate blocks, then the rest', () => {
    expect(squeezeSizes(168, 32)).toEqual([32]);
    expect(squeezeSizes(168, 168)).toEqual([168]);
    expect(squeezeSizes(136, 336)).toEqual([136, 136, 64]);
  });
});
