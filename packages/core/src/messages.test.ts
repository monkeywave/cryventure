import { describe, expect, it } from 'vitest';
import { extractParams } from './i18n.ts';
import { loadCoreMessages } from './messages.ts';

describe('loadCoreMessages', () => {
  it('returns only the requested locale', () => {
    expect(loadCoreMessages('de')['core.error.hexOddLength']).toMatch(/gerade Anzahl/);
    expect(loadCoreMessages('en-GB')['core.error.hexOddLength']).toMatch(/even number/);
  });

  it('covers every key the core emits, with matching params in EN and DE', () => {
    const en = loadCoreMessages('en');
    const de = loadCoreMessages('de');
    expect(Object.keys(en)).toEqual(expect.arrayContaining(['core.error.hexInvalidChar', 'core.error.hexOddLength']));
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const [key, template] of Object.entries(en)) expect(extractParams(de[key] ?? '')).toEqual(extractParams(template));
  });
});
