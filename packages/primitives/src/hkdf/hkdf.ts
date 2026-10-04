import { blockCount, utf8Bytes, type MacFunction } from '@cryventure/core';
import { TLS13_LABEL_PREFIX } from './manifest.ts';

/** HKDF (RFC 5869) and the TLS 1.3 HkdfLabel (RFC 8446 §7.1) as plain functions over a `MacFunction`. */

/** RFC 5869 §2.3: L ≤ 255 · HashLen. */
export const MAX_BLOCKS = 255;

/** The HMAC key Extract uses: the salt, or HashLen zero bytes when it is empty ("not provided", RFC 5869 §2.2). */
export function extractSalt(salt: readonly number[], hashLen: number): number[] {
  return salt.length === 0 ? new Array<number>(hashLen).fill(0) : [...salt];
}

const macOf = (mac: MacFunction, key: readonly number[], data: readonly number[]) =>
  Array.from(mac.mac(Uint8Array.from(key), Uint8Array.from(data)));

/** HKDF-Extract: PRK = HMAC-Hash(salt, IKM), with an empty salt replaced by HashLen zeros. */
export function hkdfExtract(
  mac: MacFunction,
  salt: readonly number[],
  ikm: readonly number[],
): number[] {
  return macOf(mac, extractSalt(salt, mac.outputSize), ikm);
}

/** The largest L Expand can produce: 255 · HashLen (the counter is one byte). */
export function maxOutputLength(hashLen: number): number {
  return MAX_BLOCKS * hashLen;
}

/** The message of block i (1-based): T(i−1) ‖ info ‖ i, with T(0) empty. */
export function expandMessage(
  previous: readonly number[],
  info: readonly number[],
  index: number,
): number[] {
  return [...previous, ...info, index];
}

/** One Expand block: its message and T(i). */
export interface ExpandBlock {
  index: number;
  message: number[];
  t: number[];
}

/** HKDF-Expand block by block: T(i) = HMAC-Hash(PRK, T(i−1) ‖ info ‖ i) for i = 1 … N = ⌈L / HashLen⌉. */
export function hkdfExpandBlocks(
  mac: MacFunction,
  prk: readonly number[],
  info: readonly number[],
  length: number,
): ExpandBlock[] {
  const blocks: ExpandBlock[] = [];
  let previous: number[] = [];
  for (let index = 1; index <= blockCount(length, mac.outputSize); index++) {
    const message = expandMessage(previous, info, index);
    previous = macOf(mac, prk, message);
    blocks.push({ index, message, t: previous });
  }
  return blocks;
}

/** OKM = the first L bytes of T(1) ‖ T(2) ‖ … ‖ T(N). */
export function okmOf(blocks: readonly ExpandBlock[], length: number): number[] {
  return blocks.flatMap((block) => block.t).slice(0, length);
}

/** HKDF-Expand (RFC 5869 §2.3). */
export function hkdfExpand(
  mac: MacFunction,
  prk: readonly number[],
  info: readonly number[],
  length: number,
): number[] {
  return okmOf(hkdfExpandBlocks(mac, prk, info, length), length);
}

/** The fields of `struct HkdfLabel` (RFC 8446 §7.1) and their byte offsets in the encoding. */
export interface HkdfLabelStruct {
  bytes: number[];
  /** "tls13 " ‖ label. */
  fullLabel: number[];
  context: number[];
  /** Offsets: uint16 length at 0, label length byte, label, context length byte, context. */
  offsets: { labelLength: number; label: number; contextLength: number; context: number };
}

/** `uint16 length ‖ u8 len ‖ "tls13 " ‖ label ‖ u8 len ‖ context`; throws a RangeError past the RFC 8446 limits. */
export function hkdfLabel(
  length: number,
  label: string,
  context: readonly number[],
): HkdfLabelStruct {
  const fullLabel = Array.from(utf8Bytes(TLS13_LABEL_PREFIX + label));
  if (!Number.isInteger(length) || length < 0 || length > 0xffff)
    throw new RangeError(`hkdfLabel: length ${length} is not a uint16`);
  if (fullLabel.length > 255)
    throw new RangeError(`hkdfLabel: label has ${fullLabel.length} bytes (max 255)`);
  if (context.length > 255)
    throw new RangeError(`hkdfLabel: context has ${context.length} bytes (max 255)`);
  const contextLength = 3 + fullLabel.length;
  return {
    bytes: [length >> 8, length & 0xff, fullLabel.length, ...fullLabel, context.length, ...context],
    fullLabel,
    context: [...context],
    offsets: { labelLength: 2, label: 3, contextLength, context: contextLength + 1 },
  };
}
