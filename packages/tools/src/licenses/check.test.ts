import { describe, expect, it } from 'vitest';
import { readPnpmLicenses, runLicenseCheck, type ExecFile } from './check.ts';
import type { PnpmLicenseReport } from './licenses.ts';

const mpl = (name: string) => ({ name, versions: ['1.0.0'], license: 'MPL-2.0' });

describe('readPnpmLicenses', () => {
  it('runs `pnpm licenses list --json --recursive` in the root and parses its output', () => {
    const calls: { file: string; args: readonly string[]; cwd: string }[] = [];
    const exec: ExecFile = (file, args, options) => {
      calls.push({ file, args, cwd: options.cwd });
      return '{"MIT":[{"name":"a","versions":["1.0.0"],"license":"MIT"}]}';
    };
    expect(readPnpmLicenses('/repo', exec)).toEqual({ MIT: [{ name: 'a', versions: ['1.0.0'], license: 'MIT' }] });
    expect(calls).toEqual([{ file: 'pnpm', args: ['licenses', 'list', '--json', '--recursive'], cwd: '/repo' }]);
  });

  it('fails loudly on output that is not JSON', () => {
    expect(() => readPnpmLicenses('/repo', () => 'ERR_PNPM')).toThrow();
  });
});

describe('runLicenseCheck', () => {
  it('accepts lightningcss and its platform binaries under the reviewed exception', () => {
    const report: PnpmLicenseReport = { 'MPL-2.0': ['lightningcss', 'lightningcss-darwin-x64', 'lightningcss-linux-x64-musl', 'lightningcss-win32-arm64-msvc'].map(mpl) };
    const result = runLicenseCheck(report);
    expect(result.violations).toEqual([]);
    expect(result.excepted).toHaveLength(4);
  });

  it('rejects other packages that merely start with "lightningcss"', () => {
    const report: PnpmLicenseReport = { 'MPL-2.0': ['lightningcss-evil', 'lightningcssx', 'lightningcss-darwin-x64-extra'].map(mpl) };
    expect(runLicenseCheck(report).violations.map(({ name }) => name)).toEqual(['lightningcss-evil', 'lightningcssx', 'lightningcss-darwin-x64-extra']);
  });

  it('reads the report through the injected exec function when none is given', () => {
    const exec: ExecFile = () => JSON.stringify({ 'GPL-3.0': [{ name: 'bad', versions: ['1'], license: 'GPL-3.0' }] });
    expect(runLicenseCheck(undefined, exec).violations.map(({ name }) => name)).toEqual(['bad']);
  });
});
