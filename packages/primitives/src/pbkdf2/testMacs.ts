import type { PortResolver } from '@cryventure/core';
import { macMember, portResolverFor } from '../testing/hmacPorts.ts';
import { pbkdf2Manifest } from './manifest.ts';

/** Test support: the real `Mac` ports of the registered producers (`testing/hmacPorts.ts`), as PBKDF2's tests use them. */
export { allHmacMembers, type HmacMember } from '../testing/hmacPorts.ts';

/** An environment variable of the test runner (Node), without depending on Node's types. */
export function testEnv(name: string): string | undefined {
  return (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env[name];
}

/**
 * Per-test timeout for the conformance cases: RFC 7914 §11 case 2 runs c = 80000 iterations, which
 * takes well over vitest's 5 s default on a loaded 2-core CI runner.
 */
export const CONFORMANCE_TIMEOUT_MS = 60_000;

/** The port resolver a host would prepare for `params` (loads only the named producer). */
export function resolverFor(params: unknown): Promise<PortResolver> {
  return portResolverFor(pbkdf2Manifest, params);
}

/** The HMAC member `ref` (e.g. `sha1:hmac-sha-1`); throws when it is not registered. */
export const hmacMember = macMember;
