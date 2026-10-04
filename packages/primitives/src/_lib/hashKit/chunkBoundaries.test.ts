import { describe, expect, it } from 'vitest';

/**
 * The lazy producer chunks stay apart: a producer that is not SHA-2 must not pull the SHA-2
 * recorder (`_lib/sha2/record.ts`) into its chunk through its static relative imports.
 */

const SHA2_RECORDER = '_lib/sha2/record.ts';
const VALUE_IMPORT = /^\s*(?:import|export)\s(?!type\s)[^'"]*?from\s+'(\.[^']+)'/gm;

/** `relative` resolved against the directory of `from` (both relative to `src`). */
function resolvePath(from: string, relative: string): string {
  const parts = from.split('/').slice(0, -1);
  for (const segment of relative.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment !== '.') parts.push(segment);
  }
  return parts.join('/');
}

/** Every source reachable from `entry` through relative value (not type-only) imports. */
function moduleGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = SOURCES[file];
    if (source === undefined) throw new Error(`unknown source ${file}`);
    for (const match of source.matchAll(VALUE_IMPORT)) visit(resolvePath(file, match[1]!));
  };
  visit(entry);
  return seen;
}

/** Every primitives source, keyed by its path relative to `src` (e.g. `sha3/record.ts`). */
const SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>(['../../**/*.ts', '!../../**/*.test.ts'], { eager: true, import: 'default', query: '?raw' } as ImportMetaGlobOptions & { eager: true })).map(([path, source]) => [
    resolvePath('_lib/hashKit/chunkBoundaries.test.ts', path),
    source,
  ]),
);

describe('producer chunk boundaries', () => {
  it('follows the SHA-2 producers into the SHA-2 recorder', () => {
    expect(moduleGraph('sha256/module.ts').has(SHA2_RECORDER)).toBe(true);
  });

  it.each(['sha3', 'md5', 'sha1', 'blake2'])('%s/module.ts does not import the SHA-2 recorder', (producer) => {
    expect(moduleGraph(`${producer}/module.ts`).has(SHA2_RECORDER)).toBe(false);
  });
});
