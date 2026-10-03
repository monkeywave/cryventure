import { describe, expect, it } from 'vitest';
import { checkLicenses, findException, formatLicenseResult, isExpressionAllowed, type PnpmLicenseReport } from './licenses.ts';
import { ALLOWED_LICENSES, LICENSE_EXCEPTIONS } from './policy.ts';

const allowed = new Set(['MIT', 'ISC', 'CC0-1.0']);

describe('isExpressionAllowed', () => {
  it.each([
    ['MIT', true],
    ['GPL-3.0', false],
    ['(MIT OR CC0-1.0)', true],
    ['GPL-3.0 OR MIT', true],
    ['MIT OR GPL-3.0', true],
    ['MIT AND ISC', true],
    ['MIT AND GPL-3.0', false],
    ['(MIT AND ISC) OR GPL-3.0', true],
    ['(MIT OR GPL-3.0) AND (ISC OR AGPL-3.0)', true],
    ['(MIT OR GPL-3.0) AND AGPL-3.0', false],
    ['((MIT))', true],
    ['Apache-2.0 WITH LLVM-exception', false],
    ['SEE LICENSE IN LICENSE.md', false],
    ['Unknown', false],
    ['', false],
  ])('%s → %s', (expression, expected) => {
    expect(isExpressionAllowed(expression, allowed)).toBe(expected);
  });

  it('accepts a WITH expression only when listed verbatim', () => {
    expect(isExpressionAllowed('Apache-2.0 WITH LLVM-exception', new Set(['Apache-2.0 WITH LLVM-exception']))).toBe(true);
  });
});

describe('findException', () => {
  const exceptions = [
    { name: 'lib-*', license: 'MPL-2.0', reason: 'r' },
    { name: 'exact', license: 'LGPL-3.0', reason: 'r' },
  ];
  it('matches prefix patterns and exact names, and requires the same license', () => {
    expect(findException({ name: 'lib-linux-x64', versions: ['1'], license: 'MPL-2.0' }, exceptions)).toBeDefined();
    expect(findException({ name: 'exact', versions: ['1'], license: 'LGPL-3.0' }, exceptions)).toBeDefined();
    expect(findException({ name: 'exact-not', versions: ['1'], license: 'LGPL-3.0' }, exceptions)).toBeUndefined();
    expect(findException({ name: 'lib-x', versions: ['1'], license: 'GPL-3.0' }, exceptions)).toBeUndefined();
  });
});

describe('checkLicenses', () => {
  const report: PnpmLicenseReport = {
    MIT: [{ name: 'a', versions: ['1.0.0'], license: 'MIT' }],
    'MPL-2.0': [{ name: 'lib-darwin', versions: ['2.0.0'], license: 'MPL-2.0' }],
    'GPL-3.0': [{ name: 'bad', versions: ['3.0.0', '3.1.0'], license: 'GPL-3.0' }],
  };
  const policy = { allowed, exceptions: [{ name: 'lib-*', license: 'MPL-2.0', reason: 'build only' }] };

  it('separates violations from reviewed exceptions', () => {
    const result = checkLicenses(report, policy);
    expect(result.packages).toBe(3);
    expect(result.violations).toEqual([{ name: 'bad', versions: ['3.0.0', '3.1.0'], license: 'GPL-3.0' }]);
    expect(result.excepted.map((entry) => entry.name)).toEqual(['lib-darwin']);
  });

  it('formats violations first and a summary last', () => {
    const lines = formatLicenseResult(checkLicenses(report, policy));
    expect(lines[0]).toBe('✗ not allowed: bad@3.0.0, 3.1.0 (GPL-3.0)');
    expect(lines.at(-1)).toBe('licenses: 3 packages, 1 violation(s), 1 reviewed exception(s)');
  });

  it('passes an empty report', () => {
    expect(checkLicenses({}, policy)).toEqual({ packages: 0, violations: [], excepted: [] });
  });
});

describe('policy', () => {
  it('justifies every allowed license and exception', () => {
    for (const reason of Object.values(ALLOWED_LICENSES)) expect(reason.length).toBeGreaterThan(10);
    for (const exception of LICENSE_EXCEPTIONS) expect(exception.reason.length).toBeGreaterThan(10);
  });

  it('allows no copyleft license wholesale', () => {
    const copyleft = Object.keys(ALLOWED_LICENSES).filter((id) => /GPL|MPL|EPL|EUPL|CDDL|SSPL/.test(id));
    expect(copyleft).toEqual([]);
  });
});
