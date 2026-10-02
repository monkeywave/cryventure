import { describe, expect, it } from 'vitest';
import { lessonKeyFromPath } from './lessonKey.ts';

describe('lessonKeyFromPath', () => {
  it.each([
    ['/cryventure/de/symmetric/aes/subbytes-sbox/', '/cryventure/', 'symmetric/aes/subbytes-sbox'],
    ['/cryventure/en/symmetric/aes/subbytes-sbox', '/cryventure', 'symmetric/aes/subbytes-sbox'],
    ['/en/foundations/welcome-lab/', '/', 'foundations/welcome-lab'],
    ['/de/foundations/welcome-lab/', '', 'foundations/welcome-lab'],
    ['/foundations/welcome-lab/', '/', 'foundations/welcome-lab'],
    ['/cryventure/de/', '/cryventure/', ''],
    ['/cryventure', '/cryventure/', ''],
    ['/cryventurex/en/a/', '/cryventure/', 'cryventurex/en/a'],
    ['/fr/a/', '/', 'fr/a'],
  ])('%s with base %s → %s', (pathname, base, expected) => {
    expect(lessonKeyFromPath(pathname, base)).toBe(expected);
  });

  it('gives EN and DE pages the same key', () => {
    expect(lessonKeyFromPath('/cryventure/en/x/y/', '/cryventure/')).toBe(lessonKeyFromPath('/cryventure/de/x/y/', '/cryventure/'));
  });
});
