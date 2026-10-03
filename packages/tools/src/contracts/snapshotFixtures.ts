import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import {
  AES_FIXTURE_PRESETS,
  aesBundleFixturePath,
  buildAesBundleFixture,
  buildIsaViewFixture,
  buildMemoryViewFixture,
  INSTRUCTIONS_VIEW_FIXTURE,
  MEMORY_VIEW_FIXTURE,
  REGISTERS_VIEW_FIXTURE,
} from './deriverViewFixtures.ts';
import {
  buildFieldViewFixture,
  buildGcmChainViewFixture,
  buildGcmWireViewFixture,
  FIELD_VIEW_FIXTURE,
  GCM_CHAIN_VIEW_FIXTURE,
  GCM_WIRE_VIEW_FIXTURE,
} from './gcmViewFixtures.ts';
import { buildKeyScheduleViewFixture, KEY_SCHEDULE_VIEW_FIXTURE } from './keyScheduleFixture.ts';
import { buildMathViewFixture, MATH_VIEW_FIXTURE } from './mathViewFixture.ts';
import { buildModeViewFixture, MODE_VIEW_FIXTURE } from './modeViewFixture.ts';
import { buildStateViewFixture, STATE_VIEW_FIXTURE } from './stateViewFixture.ts';

/**
 * Every committed JSON snapshot of producer or deriver output (plugins may not import other plugin
 * packages, so their tests read these). `snapshotFixtures.test.ts` checks each against a fresh run;
 * `pnpm fixtures:update` (env `CV_FIXTURES_UPDATE=1`) rewrites the stale ones.
 */
export interface SnapshotFixture {
  /** Repo-relative path of the JSON file. */
  path: string;
  /** The content a fresh run produces. */
  build: () => Promise<unknown>;
}

export const SNAPSHOT_FIXTURES: readonly SnapshotFixture[] = [
  ...AES_FIXTURE_PRESETS.map((preset) => ({ path: aesBundleFixturePath(preset), build: () => buildAesBundleFixture(preset) })),
  { path: INSTRUCTIONS_VIEW_FIXTURE, build: () => buildIsaViewFixture('instructions') },
  { path: REGISTERS_VIEW_FIXTURE, build: () => buildIsaViewFixture('registers') },
  { path: MEMORY_VIEW_FIXTURE, build: buildMemoryViewFixture },
  { path: FIELD_VIEW_FIXTURE, build: buildFieldViewFixture },
  { path: GCM_CHAIN_VIEW_FIXTURE, build: buildGcmChainViewFixture },
  { path: GCM_WIRE_VIEW_FIXTURE, build: buildGcmWireViewFixture },
  { path: KEY_SCHEDULE_VIEW_FIXTURE, build: buildKeyScheduleViewFixture },
  { path: MATH_VIEW_FIXTURE, build: buildMathViewFixture },
  { path: MODE_VIEW_FIXTURE, build: buildModeViewFixture },
  { path: STATE_VIEW_FIXTURE, build: buildStateViewFixture },
];

/** The env flag `pnpm fixtures:update` sets. */
export const FIXTURES_UPDATE_ENV = 'CV_FIXTURES_UPDATE';

/** The committed snapshot at the repo-relative `path`, parsed. */
export function readSnapshot(path: string, root: string = REPO_ROOT): unknown {
  return JSON.parse(readFileSync(join(root, path), 'utf8')) as unknown;
}

/**
 * Writes `fresh` (pretty-printed, trailing newline) unless the committed snapshot already equals it,
 * so an update does not reformat unchanged files. Returns whether it wrote.
 */
export function writeSnapshotIfChanged(path: string, fresh: unknown, root: string = REPO_ROOT): boolean {
  const normalized = JSON.parse(JSON.stringify(fresh)) as unknown;
  let committed: unknown;
  try {
    committed = readSnapshot(path, root);
  } catch {
    committed = undefined;
  }
  if (isDeepStrictEqual(committed, normalized)) return false;
  writeFileSync(join(root, path), `${JSON.stringify(normalized, null, 2)}\n`);
  return true;
}
