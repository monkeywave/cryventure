import { macFunction, portMemberRef, preparePorts, Registry, type MacFunction, type PortResolver, type PrimitiveManifest } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { pbkdf2Manifest } from './manifest.ts';

/** Test support: the real `Mac` ports of the registered producers, as PBKDF2's tests use them. */

/** An environment variable of the test runner (Node), without depending on Node's types. */
export function testEnv(name: string): string | undefined {
  return (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env[name];
}

/** Every registered primitive, for `preparePorts`. */
export function primitiveRegistry(): Registry<PrimitiveManifest> {
  const registry = new Registry<PrimitiveManifest>('producers');
  primitiveManifests.forEach((manifest) => registry.register(manifest));
  return registry;
}

/** The port resolver a host would prepare for `params` (loads only the named producer). */
export function resolverFor(params: unknown): Promise<PortResolver> {
  return preparePorts(pbkdf2Manifest, params, primitiveRegistry());
}

/** One HMAC member of a registered producer, with its member ref. */
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

/** The HMAC member `ref` (e.g. `sha1:hmac-sha-1`); throws when it is not registered. */
export async function hmacMember(ref: string): Promise<MacFunction> {
  const member = (await allHmacMembers()).find((candidate) => candidate.ref === ref);
  if (member === undefined) throw new Error(`no HMAC member ${ref}`);
  return member.mac;
}
