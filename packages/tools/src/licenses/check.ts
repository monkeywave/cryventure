/**
 * `pnpm licenses:check` (docs/M4.md §9): every installed dependency, production and dev, across the
 * workspace, must carry an allowed license (`policy.ts`) or a reviewed exception. Exit code 1 otherwise.
 */
import { execFileSync } from 'node:child_process';
import { isEntryPoint } from '../fs/entryPoint.ts';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { checkLicenses, formatLicenseResult, type LicenseCheckResult, type PnpmLicenseReport } from './licenses.ts';
import { ALLOWED_LICENSES, LICENSE_EXCEPTIONS } from './policy.ts';

/** Runs a command and returns its stdout (`execFileSync` in production; injectable for tests). */
export type ExecFile = (file: string, args: readonly string[], options: { cwd: string; encoding: 'utf8'; maxBuffer: number }) => string;

const execFile: ExecFile = (file, args, options) => execFileSync(file, args, options);

/** `pnpm licenses list --json --recursive` for the whole workspace (prod + dev). */
export function readPnpmLicenses(root: string = REPO_ROOT, exec: ExecFile = execFile): PnpmLicenseReport {
  const output = exec('pnpm', ['licenses', 'list', '--json', '--recursive'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(output) as PnpmLicenseReport;
}

export function runLicenseCheck(report?: PnpmLicenseReport, exec: ExecFile = execFile): LicenseCheckResult {
  return checkLicenses(report ?? readPnpmLicenses(REPO_ROOT, exec), { allowed: new Set(Object.keys(ALLOWED_LICENSES)), exceptions: LICENSE_EXCEPTIONS });
}

if (isEntryPoint(import.meta.url)) {
  const result = runLicenseCheck();
  formatLicenseResult(result).forEach((line) => console.log(line));
  process.exitCode = result.violations.length > 0 ? 1 : 0;
}
