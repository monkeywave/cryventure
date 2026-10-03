import { defineDeriver } from '@cryventure/core';
import { isAesOpBundle } from '../_lib/applicability.ts';

/** Memory layout of the AES encryption (docs/M4.md §4), for AES bundles at op detail (§1b). */
export default defineDeriver({
  kind: 'deriver',
  id: 'memory',
  apiVersion: 1,
  from: ['state', 'values'],
  provides: ['memory'],
  appliesTo: isAesOpBundle,
  load: () => import('./module.ts'),
});
