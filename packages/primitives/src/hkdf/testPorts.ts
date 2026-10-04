import {
  macFunction,
  parseHexToArray,
  preparePorts,
  Registry,
  type MacFunction,
  type PortResolver,
  type PrimitiveManifest,
} from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { hkdfManifest, type HkdfParams } from './manifest.ts';

/**
 * Test helpers: `preparePorts` over the real primitive registry (what `runWithPorts` in
 * @cryventure/tools does; primitives may not import tools).
 */
const registry = new Registry<PrimitiveManifest>('producers');
primitiveManifests.forEach((manifest) => registry.register(manifest));

/** The resolver for `params` (loads the producer its `mac` names). */
export function resolverFor(params: Pick<HkdfParams, 'mac'>): Promise<PortResolver> {
  return preparePorts(hkdfManifest, params, registry);
}

/** The `Mac` member `ref` (`<producer>:<member>`) from the real producers. */
export async function realMac(ref: string): Promise<MacFunction> {
  const [producerId, memberId] = ref.split(':') as [string, string];
  const family = (await resolverFor({ mac: ref }))('Mac', producerId);
  const mac = family === undefined ? undefined : macFunction(family, memberId);
  if (mac === undefined) throw new Error(`no Mac member ${ref}`);
  return mac;
}

export const bytes = parseHexToArray;
