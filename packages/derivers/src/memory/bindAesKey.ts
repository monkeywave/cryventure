import type { LayoutField, StructLayout, TargetSpec } from '@cryventure/core';
import type { ImplSpec, RawLayout } from './data.ts';

/**
 * `bind`: the bytes of an `AES_KEY` (OpenSSL `struct aes_key_st`) right after one implementation's
 * `AES_set_encrypt_key` (docs/M4.md §4). Encodings, verified against OpenSSL 3.5.9 (data/SOURCES.md):
 * - `host-endian-u32` (c-ref, `GETU32`): each 4-byte schedule word is read big-endian and stored
 *   as a native u32, so on little-endian hosts every word appears byte-reversed in RAM;
 * - `raw-bytes` (aesni, armv8): the round keys are stored byte for byte.
 * The `rounds` int holds the impl's own value (aesni stores rounds − 1).
 */

const ROUND_KEY_BYTES = 16;
const WORD_BYTES = 4;
const ROUNDS_TO_KEY_BITS: Readonly<Record<number, number>> = { 10: 128, 12: 192, 14: 256 };

/** The layout field called `name`; throws when it is missing. */
export function requireField(layout: RawLayout | StructLayout, name: string): LayoutField {
  const field = layout.fields.find((candidate) => candidate.name === name);
  if (field === undefined) throw new Error(`memory: layout "${layout.name}" has no field "${name}"`);
  return field;
}

/** The value `impl` stores in `AES_KEY.rounds` for an AES with `rounds` rounds (10/12/14). */
export function storedRounds(impl: ImplSpec, rounds: number): number {
  const keyBits = ROUNDS_TO_KEY_BITS[rounds];
  const stored = keyBits === undefined ? undefined : impl.rounds[String(keyBits)];
  if (stored === undefined) throw new Error(`memory: impl "${impl.id}" has no rounds value for ${rounds} AES rounds`);
  return stored;
}

/** One schedule word as it lies in RAM under `encoding` on an `endian` host. */
export function encodeWord(word: readonly number[], encoding: ImplSpec['rdKeyEncoding'], endian: TargetSpec['endian']): number[] {
  return encoding === 'host-endian-u32' && endian === 'little' ? [...word].reverse() : [...word];
}

/** A two's-complement integer of `size` bytes in `endian` byte order. */
export function encodeInt(value: number, size: number, endian: TargetSpec['endian']): number[] {
  const little = Array.from({ length: size }, (_, index) => Number((BigInt.asUintN(size * 8, BigInt(value)) >> BigInt(index * 8)) & 0xffn));
  return endian === 'little' ? little : little.reverse();
}

function scheduleBytes(roundKeys: readonly (readonly number[])[], encoding: ImplSpec['rdKeyEncoding'], endian: TargetSpec['endian']): number[] {
  return roundKeys.flatMap((roundKey) => {
    if (roundKey.length !== ROUND_KEY_BYTES) throw new Error(`memory: round key of ${roundKey.length} bytes (expected ${ROUND_KEY_BYTES})`);
    return Array.from({ length: ROUND_KEY_BYTES / WORD_BYTES }, (_, word) => encodeWord(roundKey.slice(word * WORD_BYTES, (word + 1) * WORD_BYTES), encoding, endian)).flat();
  });
}

/**
 * The `layout.size` bytes of an `AES_KEY` holding `roundKeys` (rounds + 1 keys of 16 bytes) as
 * `impl` writes them. Unused `rd_key` words and padding stay zero.
 */
export function bindAesKey(
  layout: RawLayout | StructLayout,
  impl: ImplSpec,
  roundKeys: readonly (readonly number[])[],
  rounds: number,
  endian: TargetSpec['endian'] = 'little',
): Uint8Array {
  if (roundKeys.length !== rounds + 1) throw new Error(`memory: ${roundKeys.length} round keys for ${rounds} rounds`);
  const rdKey = requireField(layout, 'rd_key');
  const roundsField = requireField(layout, 'rounds');
  const schedule = scheduleBytes(roundKeys, impl.rdKeyEncoding, endian);
  if (schedule.length > rdKey.size) throw new Error(`memory: ${schedule.length} schedule bytes exceed rd_key (${rdKey.size})`);
  const bytes = new Uint8Array(layout.size);
  bytes.set(schedule, rdKey.offset);
  bytes.set(encodeInt(storedRounds(impl, rounds), roundsField.size, endian), roundsField.offset);
  return bytes;
}
