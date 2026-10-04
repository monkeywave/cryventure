import { describe, expect, it } from 'vitest';
import { kmacRegions } from './regions.ts';

describe('kmacRegions', () => {
  const sizes = { key: 32, message: 4, encodedKey: 168, encodedLength: 3, padded: 504, output: 32 };

  it('lists key, message, the two encodings (blank at first), then padded, A and output', () => {
    expect(kmacRegions(sizes).map((region) => [region.id, region.labelKey, region.shape[0], region.initial])).toEqual([
      ['key', 'plugin.kmac.region.key', 32, undefined],
      ['message', 'plugin.kmac.region.message', 4, undefined],
      ['encodedKey', 'plugin.kmac.region.encodedKey', 168, 'blank'],
      ['encodedLength', 'plugin.kmac.region.encodedLength', 3, 'blank'],
      ['padded', 'plugin.kmac.region.padded', 504, 'blank'],
      ['A', 'plugin.kmac.region.A', 200, undefined],
      ['output', 'plugin.kmac.region.output', 32, 'blank'],
    ]);
  });

  it('omits an empty key and an empty message', () => {
    expect(kmacRegions({ ...sizes, key: 0, message: 0 }).map((region) => region.id)).toEqual(['encodedKey', 'encodedLength', 'padded', 'A', 'output']);
  });
});
