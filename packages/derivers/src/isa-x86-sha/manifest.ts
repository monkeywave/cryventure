import { defineDeriver } from '@cryventure/core';
import { isSha256RoundBundle } from '../_lib/applicability.ts';

/**
 * x86-64 SHA extensions ("SHA-NI") listing of the SHA-256 compression function (docs/M5.md §5):
 * `instructions@x86_64-sha-ni` and `registers@x86_64-sha-ni` for SHA-224/256 at round detail, the
 * listing repeated per block. The implementation loads lazily.
 */
export default defineDeriver({
  kind: 'deriver',
  id: 'isa-x86-sha',
  apiVersion: 1,
  from: ['state', 'values', 'wordops'],
  provides: ['instructions', 'registers'],
  appliesTo: isSha256RoundBundle,
  load: () => import('./module.ts'),
});
