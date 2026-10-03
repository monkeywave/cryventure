/**
 * Post-build step (docs/M4.md §9), run by `build` after `astro build` and before `build-sw.mjs`
 * (the service worker must precache the final HTML):
 *  1. hashes every inline `<script>`/`<style>` in each `dist/**\/*.html` and writes that page's CSP
 *     `<meta>` (GitHub Pages has no custom headers);
 *  2. writes `docker/generated/security-headers.conf`, the nginx header include the Docker image
 *     uses: the union of all hashes plus `frame-ancestors 'none'` and the other security headers.
 * Both come from `src/security/csp.ts`. Hashes depend on the built content (and so on `CV_BASE`),
 * which is why they are computed per build and never committed.
 *
 * Usage: `tsx scripts/csp-postbuild.ts [distDir] [--headers file]` (defaults: `apps/web/dist`,
 * `docker/generated/security-headers.conf`), so a scratch build can be post-processed in place.
 * The steps take an injected `PostbuildFs` so they are unit-tested without touching disk.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPolicy, renderNginxHeaders, type InlineHashes } from '../src/security/csp';
import { collectInlineHashes, injectCspMeta, mergeInlineHashes } from '../src/security/inlineHtml';

/** The file operations the post-build step needs (injected so the steps are testable). */
export interface PostbuildFs {
  /** Every regular file below `dir`, recursively, as full paths. */
  listFiles(dir: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  /** Creates `dir` and its parents if missing. */
  mkdir(dir: string): Promise<void>;
}

export const nodePostbuildFs: PostbuildFs = {
  async listFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
  },
  readFile: (path) => readFile(path, 'utf8'),
  writeFile: (path, content) => writeFile(path, content),
  mkdir: async (dir) => void (await mkdir(dir, { recursive: true })),
};

export interface PostbuildPaths {
  readonly distDir: string;
  readonly headersFile: string;
}

export interface PostbuildSummary {
  readonly pages: number;
  readonly scriptHashes: number;
  readonly styleHashes: number;
}

/** Step 1a: every built page below `distDir`. */
export async function findHtmlFiles(fs: PostbuildFs, distDir: string): Promise<string[]> {
  return (await fs.listFiles(distDir)).filter((file) => file.endsWith('.html'));
}

/** Step 1b: writes each page its own `<meta>` CSP; returns each page's hashes (same order). */
export async function writePageMetas(fs: PostbuildFs, files: readonly string[]): Promise<InlineHashes[]> {
  return Promise.all(
    files.map(async (file) => {
      const html = await fs.readFile(file);
      const hashes = collectInlineHashes(html);
      await fs.writeFile(file, injectCspMeta(html, buildPolicy(hashes, 'meta')));
      return hashes;
    }),
  );
}

/** Step 2: writes the nginx header include for the union of all pages' hashes; returns the union. */
export async function writeHeaderInclude(fs: PostbuildFs, headersFile: string, perPage: readonly InlineHashes[]): Promise<InlineHashes> {
  const union = mergeInlineHashes(perPage);
  await fs.mkdir(dirname(headersFile));
  await fs.writeFile(headersFile, renderNginxHeaders(buildPolicy(union, 'header')));
  return union;
}

export async function runCspPostbuild({ fs, distDir, headersFile }: PostbuildPaths & { fs: PostbuildFs }): Promise<PostbuildSummary> {
  const files = await findHtmlFiles(fs, distDir);
  const union = await writeHeaderInclude(fs, headersFile, await writePageMetas(fs, files));
  return { pages: files.length, scriptHashes: union.scripts.length, styleHashes: union.styles.length };
}

const USAGE = 'usage: csp-postbuild.ts [distDir] [--headers file]';

/** `[distDir] [--headers file]` over the defaults; paths are resolved against the cwd. */
export function parseCliArgs(args: readonly string[], defaults: PostbuildPaths): PostbuildPaths {
  let { distDir, headersFile } = defaults;
  let positional = 0;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    const next = args[i + 1];
    if (arg === '--headers' && next !== undefined) {
      headersFile = resolve(next);
      i += 1;
    } else if (!arg.startsWith('-') && positional === 0) {
      distDir = resolve(arg);
      positional += 1;
    } else {
      throw new Error(USAGE);
    }
  }
  return { distDir, headersFile };
}

const DEFAULT_PATHS: PostbuildPaths = {
  distDir: fileURLToPath(new URL('../dist', import.meta.url)),
  headersFile: fileURLToPath(new URL('../../../docker/generated/security-headers.conf', import.meta.url)),
};

async function main(): Promise<void> {
  const paths = parseCliArgs(process.argv.slice(2), DEFAULT_PATHS);
  const summary = await runCspPostbuild({ fs: nodePostbuildFs, ...paths });
  console.log(
    `[csp] ${summary.pages} pages: <meta> CSP written; header include has ${summary.scriptHashes} script and ${summary.styleHashes} style hashes.`,
  );
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(`[csp] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
