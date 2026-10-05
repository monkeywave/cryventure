import { parseHexOrThrow, toHex } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import tc4 from './vectors/rfc6070-tc4.json' with { type: 'json' };
import { pbkdf2 } from './pbkdf2.ts';
import { macMember } from '../testing/hmacPorts.ts';
import { testEnv } from './testMacs.ts';

/** RFC 6070 TC4 (c = 16777216, several minutes) through the `Mac` port, opt-in with `CV_SLOW=1` (docs/M7.md §2g). */
const SLOW = testEnv('CV_SLOW') === '1';

describe.skipIf(!SLOW)('pbkdf2 RFC 6070 TC4 (CV_SLOW=1)', () => {
  it.each(tc4.cases.map((testCase) => [testCase.name, testCase] as const))('%s through the Mac port', async (_name, testCase) => {
    const mac = await macMember('sha1:hmac-sha-1');
    const dk = pbkdf2(mac, parseHexOrThrow(testCase.password), parseHexOrThrow(testCase.salt), testCase.iterations, testCase.dkLen);
    expect(toHex(dk)).toBe(testCase.dk);
  }, 20 * 60_000);
});
