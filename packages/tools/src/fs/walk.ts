import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Directories never worth descending into when scanning the repo. */
export const SKIPPED_DIRS: ReadonlySet<string> = new Set(['node_modules', 'dist', 'coverage', '.astro', '.git']);

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Converts an OS path to forward slashes so matching works on every platform. */
export function toPosix(path: string): string {
  return path.split(sep).join('/');
}

function walk(root: string, prefix: string, out: string[]): void {
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) walk(root, path, out);
    } else if (entry.isFile()) {
      out.push(path);
    }
  }
}

/**
 * Recursively lists files under `root` as POSIX paths relative to `root`, sorted.
 * Build/dependency folders are pruned; a missing root yields an empty list.
 */
export function listFiles(root: string, accept: (relativePath: string) => boolean = () => true): string[] {
  if (!isDirectory(root)) return [];
  const files: string[] = [];
  walk(root, '', files);
  return files.filter(accept).sort();
}

/** POSIX path of `path` relative to `root`. */
export function relativePosix(root: string, path: string): string {
  return toPosix(relative(root, path));
}
