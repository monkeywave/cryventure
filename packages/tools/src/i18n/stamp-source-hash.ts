import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { isEntryPoint } from '../fs/entryPoint.ts';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { relativePosix } from '../fs/walk.ts';
import { DOCS_ROOT } from './check-parity.ts';
import { englishCounterpart, sourceHashOf, stampSourceHash } from './translation-freshness.ts';

/**
 * `pnpm i18n:stamp <de-page…>`: writes the current EN hash into the given DE pages. Run it only
 * after the German text has been updated to match the English page (docs/AUTHORING.md).
 */

export type StampResult = { ok: true; dePath: string; enPath: string; hash: string } | { ok: false; arg: string; message: string };

/** Repo-relative, slash-separated form of a CLI path argument (relative to `cwd` or absolute). */
export function toRepoPath(arg: string, root: string, cwd: string): string {
  const absolute = isAbsolute(arg) ? arg : resolve(cwd, arg);
  return relativePosix(root, absolute);
}

/** Stamps one DE page in the repo at `root`; never throws, reports problems as a failed result. */
export function stampPage(arg: string, root: string, cwd: string = process.cwd()): StampResult {
  const dePath = toRepoPath(arg, root, cwd);
  const enPath = englishCounterpart(dePath, DOCS_ROOT);
  if (enPath === undefined) return { ok: false, arg, message: `not a German page under ${DOCS_ROOT}/de/` };
  if (!existsSync(join(root, dePath))) return { ok: false, arg, message: `${dePath} does not exist` };
  if (!existsSync(join(root, enPath))) return { ok: false, arg, message: `no English counterpart ${enPath}` };
  const hash = sourceHashOf(readFileSync(join(root, enPath)));
  try {
    writeFileSync(join(root, dePath), stampSourceHash(readFileSync(join(root, dePath), 'utf8'), hash));
  } catch (error) {
    return { ok: false, arg, message: `${dePath}: ${(error as Error).message}` };
  }
  return { ok: true, dePath, enPath, hash };
}

export function stampLine(result: StampResult): string {
  return result.ok ? `stamped ${result.dePath}  ${result.hash}` : `error   ${result.arg}  ${result.message}`;
}

/** Stamps every argument; exit code 1 on a usage error or when any page failed. */
export function runStamp(args: readonly string[], root: string = REPO_ROOT, cwd: string = process.cwd()): { lines: string[]; exitCode: 0 | 1 } {
  if (args.length === 0) return { lines: ['usage: pnpm i18n:stamp <de-page.mdx…>'], exitCode: 1 };
  const results = args.map((arg) => stampPage(arg, root, cwd));
  return { lines: results.map(stampLine), exitCode: results.every((result) => result.ok) ? 0 : 1 };
}

if (isEntryPoint(import.meta.url)) {
  // pnpm runs root scripts from the repo root; INIT_CWD is where the user typed the command.
  const { lines, exitCode } = runStamp(process.argv.slice(2), REPO_ROOT, process.env.INIT_CWD ?? process.cwd());
  lines.forEach((line) => console.log(line));
  process.exitCode = exitCode;
}
