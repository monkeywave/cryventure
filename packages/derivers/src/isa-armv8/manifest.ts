import { defineDeriver } from '@cryventure/core';
import { isAesOpBundle } from '../_lib/applicability.ts';

/**
 * AArch64 ARMv8 Crypto Extensions listing of the AES encryption (docs/M4.md §5): `instructions@aarch64-armv8-ce` and
 * `registers@aarch64-armv8-ce`. The implementation loads lazily.
 */
export default defineDeriver({
  kind: 'deriver',
  id: 'isa-armv8',
  apiVersion: 1,
  from: ['state', 'values'],
  provides: ['instructions', 'registers'],
  appliesTo: isAesOpBundle,
  load: () => import('./module.ts'),
});
