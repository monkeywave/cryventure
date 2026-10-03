import type { DeriverModule, FacetKey, TraceBundle } from '@cryventure/core';
import { readAesRun } from './aesContract.ts';
import { memoryFacets } from './memoryFacet.ts';

/** Memory deriver: the modeled stack frame of one AES encryption, per target + OpenSSL impl. */
export function derive(bundle: TraceBundle): Partial<Record<FacetKey, unknown>> {
  return memoryFacets(readAesRun(bundle));
}

const memoryModule: DeriverModule = { derive };

export default memoryModule;
