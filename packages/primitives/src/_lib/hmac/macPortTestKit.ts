import { macFunction, parseHexOrThrow, toHex, type MacFamily, type MacFunction } from '@cryventure/core';
import { hmacMemberId } from './manifestKit.ts';
import { testHash } from './testHashes.ts';

/**
 * Test support for the producers' `Mac` ports (docs/M7.md §2a): published vectors and the context
 * contract checked through `ports.Mac`, so each producer test proves its own port, not only the lib.
 * The split and clone checks twin `PORT_SANITY.Mac` in @cryventure/tools (`portChecks.ts`), which
 * primitives may not import; keep the two in step.
 */

/** One vector as the files in `vectors/` store it: the hash by its file name, hex key, message and (possibly truncated) tag. */
export interface MacVector {
  readonly name: string;
  readonly hash: string;
  readonly key: string;
  readonly msg: string;
  readonly tag: string;
}

/** The member `memberId` of `family`; throws when the port lacks it. */
export function macMember(family: MacFamily, memberId: string): MacFunction {
  const fn = macFunction(family, memberId);
  if (fn === undefined) throw new Error(`Mac family ${family.id} has no member ${memberId}`);
  return fn;
}

/** The HMAC member of `family` over the hash a vector names (e.g. `sha512-256` → `hmac-sha-512/256`). */
export function hmacMemberFor(family: MacFamily, hashName: string): MacFunction {
  return macMember(family, hmacMemberId(testHash(hashName).id));
}

/** The vector's tag computed by `fn`, cut to the vector's tag length (RFC 4231 TC5 and other truncated tags). */
export function vectorTagHex(fn: MacFunction, vector: Pick<MacVector, 'key' | 'msg' | 'tag'>): string {
  const tag = fn.mac(parseHexOrThrow(vector.key), parseHexOrThrow(vector.msg));
  return toHex(tag.subarray(0, vector.tag.length / 2));
}

/** `[name, vector]` pairs for `it.each`. */
export const namedVectors = <V extends MacVector>(vectors: readonly V[]): (readonly [string, V])[] => vectors.map((vector) => [vector.name, vector] as const);

/** Deterministic test bytes. */
export const patternBytes = (length: number, seed: number): Uint8Array => Uint8Array.from({ length }, (_, index) => (index * 29 + seed) & 0xff);

/** Message split points around the block size: 0, 1, B − 1, B, B + 1 and the end. */
function splitPoints(fn: MacFunction, length: number): number[] {
  return [...new Set([0, 1, fn.blockSize - 1, fn.blockSize, fn.blockSize + 1, length])].filter((point) => point >= 0 && point <= length);
}

/** Problems with `create(key)` fed `message` in two parts at every split point, against the one-shot tag. */
export function splitUpdateProblems(fn: MacFunction, key: Uint8Array, message: Uint8Array): string[] {
  const expected = toHex(fn.mac(key, message));
  return splitPoints(fn, message.length).flatMap((point) => {
    const context = fn.create(key);
    context.update(message.subarray(0, point));
    context.update(message.subarray(point));
    const actual = toHex(context.mac());
    return actual === expected ? [] : [`${fn.id}: split at ${point} of ${message.length} gives ${actual}, mac gives ${expected}`];
  });
}

/** Problems with a clone taken after `prefix`: each copy continued differently must equal its one-shot tag. */
export function cloneProblems(fn: MacFunction, key: Uint8Array, prefix: Uint8Array): string[] {
  const original = fn.create(key);
  original.update(prefix);
  const copy = original.clone();
  const [tailA, tailB] = [patternBytes(fn.blockSize + 5, 1), patternBytes(3, 2)];
  original.update(tailA);
  copy.update(tailB);
  const cases: [string, Uint8Array, Uint8Array][] = [
    ['original', original.mac(), Uint8Array.from([...prefix, ...tailA])],
    ['clone', copy.mac(), Uint8Array.from([...prefix, ...tailB])],
  ];
  return cases.flatMap(([what, actual, message]) =>
    toHex(actual) === toHex(fn.mac(key, message)) ? [] : [`${fn.id}: the ${what} after a ${prefix.length}-byte prefix does not equal mac of its message`],
  );
}
