import { describe, expect, it } from 'vitest';
import { loadDeriverMessages } from './messages.ts';

describe('loadDeriverMessages', () => {
  it('returns only deriver.* keys in each locale (empty while no deriver has a catalog)', () => {
    for (const lang of ['en', 'de-CH', undefined]) {
      const messages = loadDeriverMessages(lang);
      expect(Object.keys(messages).every((key) => key.startsWith('deriver.'))).toBe(true);
    }
  });

  it('serves the same keys in English and German', () => {
    expect(Object.keys(loadDeriverMessages('de')).sort()).toEqual(Object.keys(loadDeriverMessages('en')).sort());
  });
});
