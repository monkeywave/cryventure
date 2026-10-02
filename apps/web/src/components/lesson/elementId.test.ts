import { describe, expect, it } from 'vitest';
import { nextElementId } from './elementId.ts';

describe('nextElementId', () => {
  it('prefixes the id and never repeats it', () => {
    const first = nextElementId('cv-formula-caption');
    const second = nextElementId('cv-formula-caption');
    expect(first).toMatch(/^cv-formula-caption-\d+$/);
    expect(second).not.toBe(first);
  });

  it('keeps the prefix of each caller', () => {
    expect(nextElementId('a')).toMatch(/^a-\d+$/);
  });
});
