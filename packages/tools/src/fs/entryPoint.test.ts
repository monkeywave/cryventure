import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isEntryPoint } from './entryPoint.ts';

describe('isEntryPoint', () => {
  const script = '/repo/packages/tools/src/cli.ts';

  it('matches the module URL of the started script', () => {
    expect(isEntryPoint(pathToFileURL(script).href, script)).toBe(true);
  });

  it('rejects other modules and a missing script path', () => {
    expect(isEntryPoint(pathToFileURL('/repo/other.ts').href, script)).toBe(false);
    expect(isEntryPoint(pathToFileURL(script).href, undefined)).toBe(false);
  });

  it('is false for this test module under the test runner', () => {
    expect(isEntryPoint(import.meta.url)).toBe(false);
  });
});
