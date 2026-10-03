import { defineDeriver } from '@cryventure/core';
import { isAesOpBundle } from '../_lib/applicability.ts';

/**
 * x86-64 AES-NI listing of the AES encryption (docs/M4.md §5): `instructions@x86_64-aesni` and
 * `registers@x86_64-aesni`. The implementation loads lazily.
 */
export default defineDeriver({
  kind: 'deriver',
  id: 'isa-x86',
  apiVersion: 1,
  from: ['state', 'values'],
  provides: ['instructions', 'registers'],
  appliesTo: isAesOpBundle,
  load: () => import('./module.ts'),
});
