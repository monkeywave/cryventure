import { defineDeriver } from '@cryventure/core';
import { isSha256RoundBundle } from '../_lib/applicability.ts';
import { isSha512RoundBundle } from '../_lib/sha/manifestKit.ts';

/**
 * AArch64 ARMv8 SHA2 (FEAT_SHA256) listing of the SHA-256 compression function (docs/M5.md §5):
 * `instructions@aarch64-armv8-sha2` and `registers@aarch64-armv8-sha2` for SHA-224/256 at round
 * detail; ARMv8.2 SHA512 (FEAT_SHA512) for the SHA-512 family (docs/M6.md §5):
 * `…@aarch64-armv8-sha512`. The listing repeats per block. The implementation loads lazily.
 */
export default defineDeriver({
  kind: 'deriver',
  id: 'isa-armv8-sha',
  apiVersion: 1,
  from: ['state', 'values', 'wordops'],
  provides: ['instructions', 'registers'],
  appliesTo: (bundle) => isSha256RoundBundle(bundle) || isSha512RoundBundle(bundle),
  load: () => import('./module.ts'),
});
