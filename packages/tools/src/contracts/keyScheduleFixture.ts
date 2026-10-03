import { getFacet, type StateFacet } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { runOrThrow } from './primitiveContract.ts';

/** The key-schedule view tests use a JSON snapshot of the AES derivation facet (views may not import primitives). */
export const KEY_SCHEDULE_VIEW_FIXTURE = 'packages/views/src/key-schedule/fixtures/aes128-derivation.json';

/** The fixture as a fresh AES run of the FIPS 197 App. B preset produces it. */
export async function buildKeyScheduleViewFixture(): Promise<{ stepCount: number | undefined; derivation: unknown }> {
  const manifest = primitiveManifests.find((candidate) => candidate.id === 'aes')!;
  const preset = manifest.presets.find((candidate) => candidate.id === 'fips197-b')!;
  const bundle = runOrThrow(await manifest.load(), preset.params);
  return {
    stepCount: getFacet<StateFacet<string, { op: string }>>(bundle, 'state')?.steps.length,
    derivation: getFacet(bundle, 'derivation'),
  };
}
