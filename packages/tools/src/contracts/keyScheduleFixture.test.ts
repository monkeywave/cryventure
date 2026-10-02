import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getFacet, type StateFacet } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { runOrThrow } from './primitiveContract.ts';

/** The key-schedule view tests use a JSON snapshot of the AES derivation facet (views may not import primitives). */
const FIXTURE = join(REPO_ROOT, 'packages/views/src/key-schedule/fixtures/aes128-derivation.json');

describe('key-schedule view fixture', () => {
  it('matches a fresh AES run (FIPS 197 App. B preset)', async () => {
    const manifest = primitiveManifests.find((candidate) => candidate.id === 'aes')!;
    const preset = manifest.presets.find((candidate) => candidate.id === 'fips197-b')!;
    const bundle = runOrThrow(await manifest.load(), preset.params);
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as unknown;
    expect(fixture).toEqual({
      stepCount: getFacet<StateFacet<string, { op: string }>>(bundle, 'state')?.steps.length,
      derivation: getFacet(bundle, 'derivation'),
    });
  });
});
