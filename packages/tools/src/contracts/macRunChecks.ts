import { bytesEqual, hashFunction, parsePortMemberRef, toHex, type HashFamily, type MacFamily, type MacFunction, type PrimitiveManifest } from '@cryventure/core';
import { hashLabMessage } from './hashRunChecks.ts';

/**
 * The MAC cross-check (docs/M7.md §2g), like the hash cross-check: a producer that implements both
 * `Hash` and `Mac` must build every HMAC member on one of its own Hash members
 * (`construction.hash` = `<producer>:<hash id>`), and the traced `hmac` lab run on that Hash member
 * must publish the tag the Mac member computes, for fixed keys (empty, short, exactly one block,
 * one byte past the block: the hashing branch) and messages. Non-HMAC members (keyed BLAKE2) are skipped.
 */

/** The producer id of the traced HMAC lab. */
export const HMAC_LAB_ID = 'hmac';

/** Message lengths the cross-check authenticates (all within the lab's 256-byte limit). */
export const MAC_LAB_MESSAGE_LENGTHS: readonly number[] = [0, 3, 200];

const TAG_OUTPUT = 'tag';

/** Whether the cross-check applies: the producer implements both `Hash` and `Mac`. */
export function checksMacLab(manifest: Pick<PrimitiveManifest, 'implements'>): boolean {
  return manifest.implements.includes('Hash') && manifest.implements.includes('Mac');
}

/** Key lengths for an HMAC with block size `blockSize`: empty, 20, B and B + 1 (K0 = H(K) ‖ 0*). */
export function macLabKeyLengths(blockSize: number): number[] {
  return [0, 20, blockSize, blockSize + 1];
}

/** The fixed key of `length` bytes: `(13·i + 5) mod 256`. */
export function macLabKey(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (13 * i + 5) & 0xff);
}

/** The `hmac` lab params for `hashRef`, `key` and `message`: hex message, full tag, nothing to verify. */
export function hmacLabParams(hashRef: string, key: Uint8Array, message: Uint8Array): Record<string, string> {
  return { hash: hashRef, key: toHex(key), encoding: 'hex', input: toHex(message), tagLength: 'full', expected: '' };
}

/** Validates and runs `hmac` lab params: the run's output, or why it was rejected. */
export type HmacLabRunner = (params: Record<string, string>) => Record<string, number[]> | string;

/** Why `fn` is not built on one of `producerId`'s Hash members, or undefined when it is. */
function constructionProblem(producerId: string, hashFamily: HashFamily, fn: MacFunction, hashRef: string): string | undefined {
  const parsed = parsePortMemberRef(hashRef);
  if (parsed?.producerId === producerId && hashFunction(hashFamily, parsed.memberId) !== undefined) return undefined;
  return `"${fn.id}": construction.hash "${hashRef}" is not one of this producer's Hash members`;
}

function labCaseProblems(fn: MacFunction, hashRef: string, runLab: HmacLabRunner, keyLength: number, messageLength: number): string[] {
  const key = macLabKey(keyLength);
  const message = hashLabMessage(messageLength);
  const where = `"${fn.id}" with a ${keyLength}-byte key over ${messageLength} bytes`;
  const output = runLab(hmacLabParams(hashRef, key, message));
  if (typeof output === 'string') return [`${where}: ${output}`];
  const tag = output[TAG_OUTPUT];
  if (tag === undefined) return [`${where}: run has no "${TAG_OUTPUT}" output`];
  const expected = fn.mac(key, message);
  return bytesEqual(expected, tag) ? [] : [`${where}: lab tag ${toHex(tag)}, but the Mac port gives ${toHex(expected)}`];
}

function memberProblems(producerId: string, hashFamily: HashFamily, fn: MacFunction, runLab: HmacLabRunner, messageLengths: readonly number[]): string[] {
  if (fn.construction.kind !== 'hmac') return [];
  const hashRef = fn.construction.hash;
  const problem = constructionProblem(producerId, hashFamily, fn, hashRef);
  if (problem !== undefined) return [problem];
  return macLabKeyLengths(fn.blockSize).flatMap((keyLength) => messageLengths.flatMap((length) => labCaseProblems(fn, hashRef, runLab, keyLength, length)));
}

/** Every HMAC member of `macFamily` must sit on a Hash member of `producerId` and match the `hmac` lab. */
export function macLabProblems(producerId: string, hashFamily: HashFamily, macFamily: MacFamily, runLab: HmacLabRunner, messageLengths: readonly number[] = MAC_LAB_MESSAGE_LENGTHS): string[] {
  return macFamily.functions.flatMap((fn) => memberProblems(producerId, hashFamily, fn, runLab, messageLengths));
}
