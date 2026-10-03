import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import type { DerivedFacets } from './deriverChecks.ts';

/**
 * Golden fixtures of a deriver: `packages/derivers/src/<id>/fixtures/*.golden.json`, each the
 * derived facets for one producer preset (docs/M4.md §7). The contract compares them;
 * `pnpm golden:update` (env `CV_GOLDEN_UPDATE=1`) rewrites them from the current output.
 */
export interface GoldenFixture {
  producerId: string;
  presetId: string;
  facets: DerivedFacets;
}

export interface GoldenFile {
  path: string;
  /** The parsed fixture, or why it could not be read. */
  fixture: GoldenFixture | { problem: string };
}

export const GOLDEN_SUFFIX = '.golden.json';

/** The case a deriver's first golden fixture records when it applies: FIPS 197 Appendix C.1. */
export const PREFERRED_GOLDEN_CASE = { producerId: 'aes', presetId: 'fips197-c1' } as const;

/** File name of a recorded golden fixture, e.g. `aes-fips197-c1.golden.json`. */
export function goldenFileName(producerId: string, presetId: string): string {
  return `${producerId}-${presetId}${GOLDEN_SUFFIX}`;
}

/** The env flag `pnpm golden:update` sets. */
export const GOLDEN_UPDATE_ENV = 'CV_GOLDEN_UPDATE';

/** `packages/derivers/src/<id>/fixtures` under `root`. */
export function goldenDir(id: string, root: string = REPO_ROOT): string {
  return join(root, 'packages', 'derivers', 'src', id, 'fixtures');
}

function parseGolden(text: string): GoldenFixture | { problem: string } {
  try {
    const value = JSON.parse(text) as Partial<GoldenFixture>;
    const wellFormed = typeof value.producerId === 'string' && typeof value.presetId === 'string';
    return wellFormed ? { producerId: value.producerId!, presetId: value.presetId!, facets: value.facets ?? {} } : { problem: 'needs string producerId and presetId' };
  } catch (error) {
    return { problem: `invalid JSON (${error instanceof Error ? error.message : String(error)})` };
  }
}

/** Every `*.golden.json` in `dir`, sorted by name (none when the folder does not exist). */
export function readGoldenFiles(dir: string): GoldenFile[] {
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(GOLDEN_SUFFIX))
    .sort();
  return names.map((name) => {
    const path = join(dir, name);
    return { path, fixture: parseGolden(readFileSync(path, 'utf8')) };
  });
}

/** Pretty-printed fixture JSON with a trailing newline. */
export function goldenJson(fixture: GoldenFixture): string {
  return `${JSON.stringify({ producerId: fixture.producerId, presetId: fixture.presetId, facets: fixture.facets }, null, 2)}\n`;
}

/** Writes one golden file with freshly derived facets (creating its folder). */
export function writeGoldenFile(path: string, fixture: GoldenFixture): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, goldenJson(fixture));
}

/** Whether this run regenerates golden files instead of comparing them. */
export function isGoldenUpdate(env: Record<string, string | undefined> = process.env): boolean {
  return env[GOLDEN_UPDATE_ENV] === '1';
}
