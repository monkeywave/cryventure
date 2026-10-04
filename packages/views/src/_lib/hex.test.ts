import { describe, expect, it } from 'vitest';
import { hexChunks } from './hex.ts';

describe('hexChunks', () => {
  it('chunks hex into lowercase 4-digit groups by default', () => {
    expect(hexChunks('6A09E667')).toEqual(['6a09', 'e667']);
    expect(hexChunks('6a09e667f3bcc908')).toEqual(['6a09', 'e667', 'f3bc', 'c908']);
  });

  it('takes another chunk size, the last chunk may be shorter', () => {
    expect(hexChunks('0123456789abcdef', 8)).toEqual(['01234567', '89abcdef']);
    expect(hexChunks('abcd', 8)).toEqual(['abcd']);
  });
});
