import { defineDeriver } from '@cryventure/core';
import { isSha3MappingBundle } from '../_lib/applicability.ts';

/**
 * AArch64 ARMv8.2 SHA3 (FEAT_SHA3) listing of Keccak-f[1600] (docs/M6.md §5):
 * `instructions@aarch64-armv8-sha3` and `registers@aarch64-armv8-sha3` for every `sha3` function at
 * mapping detail, the loop body repeated per round and the function per permutation. The
 * implementation loads lazily.
 */
export default defineDeriver({
  kind: 'deriver',
  id: 'isa-armv8-sha3',
  apiVersion: 1,
  from: ['state', 'sponge'],
  provides: ['instructions', 'registers'],
  appliesTo: isSha3MappingBundle,
  load: () => import('./module.ts'),
});
