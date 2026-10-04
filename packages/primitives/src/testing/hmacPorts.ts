import {
  macFunction,
  parsePortMemberRef,
  portMemberRef,
  preparePorts,
  Registry,
  type MacFunction,
  type PortResolver,
  type PrimitiveManifest,
} from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';

/**
 * Test support shared by the HMAC-based producers (hmac, hkdf, pbkdf2, tls12-prf, tls10-prf):
 * `preparePorts` over the real primitive registry (what `runWithPorts` in @cryventure/tools does;
 * primitives may not import tools) and the real HMAC `Mac` members of the registered producers.
 */

/** Every registered primitive, for `preparePorts`. */
export function primitiveRegistry(): Registry<PrimitiveManifest> {
  const registry = new Registry<PrimitiveManifest>('producers');
  primitiveManifests.forEach((manifest) => registry.register(manifest));
  return registry;
}

const REGISTRY = primitiveRegistry();

/** The port resolver a host would prepare for `manifest` with `params` (loads only the producers they name). */
export function portResolverFor(manifest: PrimitiveManifest, params: unknown): Promise<PortResolver> {
  return preparePorts(manifest, params, REGISTRY);
}

/** One HMAC member of a registered producer, with its member ref (e.g. `sha1:hmac-sha-1`). */
export interface HmacMember {
  ref: string;
  mac: MacFunction;
}

/** Every declared HMAC `Mac` member of every registered producer, loaded through its port. */
export async function allHmacMembers(): Promise<HmacMember[]> {
  const declaring = primitiveManifests.filter((manifest) => manifest.portMembers?.Mac?.some((member) => member.construction === 'hmac'));
  const perProducer = await Promise.all(
    declaring.map(async (manifest) => {
      const family = (await manifest.load()).ports?.Mac;
      if (family === undefined) throw new Error(`${manifest.id} declares Mac members but exposes no Mac port`);
      return (manifest.portMembers?.Mac ?? [])
        .filter((member) => member.construction === 'hmac')
        .map((member) => ({ ref: portMemberRef(manifest.id, member.id), mac: macFunction(family, member.id)! }));
    }),
  );
  return perProducer.flat();
}

/** The `Mac` member `ref` (`<producer>:<member>`, any construction) of a registered producer; throws when there is none. */
export async function macMember(ref: string): Promise<MacFunction> {
  const parsed = parsePortMemberRef(ref);
  const manifest = parsed === undefined ? undefined : REGISTRY.get(parsed.producerId);
  const family = manifest === undefined ? undefined : (await manifest.load()).ports?.Mac;
  const mac = family === undefined || parsed === undefined ? undefined : macFunction(family, parsed.memberId);
  if (mac === undefined) throw new Error(`no Mac member ${ref}`);
  return mac;
}
