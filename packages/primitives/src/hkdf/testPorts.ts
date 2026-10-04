import { parseHexToArray, type PortResolver } from '@cryventure/core';
import { macMember, portResolverFor } from '../testing/hmacPorts.ts';
import { hkdfManifest, type HkdfParams } from './manifest.ts';

/** Test helpers of hkdf over the shared real-registry ports (`testing/hmacPorts.ts`). */

/** The resolver for `params` (loads the producer its `mac` names). */
export function resolverFor(params: Pick<HkdfParams, 'mac'>): Promise<PortResolver> {
  return portResolverFor(hkdfManifest, params);
}

/** The `Mac` member `ref` (`<producer>:<member>`) from the real producers. */
export const realMac = macMember;

export const bytes = parseHexToArray;
