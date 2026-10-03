import { bytesEqual, parseHexOfLength, parseHexOrThrow, type HexOfLengthResult } from '../bytes.ts';
import { i18nRef, type I18nRef } from '../i18n.ts';
import { readProducerId } from '../params.ts';
import { checkKeyLength, requirePort, type PortResolver } from '../plugin/ports.ts';
import type { Pkcs7UnpadResult } from '../padding/pkcs7.ts';
import type { BlockCipher } from '../ports.ts';
import type { ValidationResult } from '../registry.ts';

/**
 * Shared plumbing of the traced mode-of-operation producers (`ecb`, `cbc`, `ctr`; docs/M3.md §4):
 * the params they have in common, resolving the block cipher, block-length run errors and block
 * indexing. The mode math itself is in `ecb.ts`, `cbc.ts` and `ctr.ts`.
 */

export type ModeDirection = 'encrypt' | 'decrypt';
export type ModePadding = 'pkcs7' | 'none';
export const MODE_DIRECTIONS: readonly ModeDirection[] = ['encrypt', 'decrypt'];
export const MODE_PADDINGS: readonly ModePadding[] = ['pkcs7', 'none'];

/** At most 4 AES blocks of input, so every block fits on screen. */
export const MODE_MAX_INPUT_BYTES = 64;
/** Upper bound for the key param; the resolved cipher decides the exact sizes at run time. */
export const MODE_MAX_KEY_BYTES = 64;
/** Upper bound for one-block params (IV, counter block); the cipher's block size is checked at run time. */
export const MODE_MAX_BLOCK_BYTES = 32;

export interface ModeCommonParams {
  cipher: string;
  keyHex: string;
  inputHex: string;
}

const lengthsUpTo = (max: number): number[] => Array.from({ length: max }, (_, index) => index + 1);
const KEY_LENGTHS = lengthsUpTo(MODE_MAX_KEY_BYTES);
const INPUT_LENGTHS = lengthsUpTo(MODE_MAX_INPUT_BYTES);
const BLOCK_LENGTHS = lengthsUpTo(MODE_MAX_BLOCK_BYTES);

const invalidParamsKey = (namespace: string): string => `${namespace}.error.invalidParams`;

/** A hex param of one block (1..32 bytes); `wrongLengthKey` reports other lengths with `{{length}}`. */
export function readBlockParamHex(input: unknown, namespace: string, wrongLengthKey: string): HexOfLengthResult {
  return parseHexOfLength(input, BLOCK_LENGTHS, { invalidType: invalidParamsKey(namespace), wrongLength: wrongLengthKey });
}

/**
 * Validates the params every mode has: `cipher` (a producer id), `keyHex` (1..64 bytes) and
 * `inputHex` (1..64 bytes). Errors use `<namespace>.error.{cipher,keyLength,inputLength,invalidParams}`.
 */
export function readModeCommon(record: Record<string, unknown>, namespace: string): ValidationResult<ModeCommonParams> {
  const cipher = readProducerId(record['cipher']);
  if (cipher === undefined) return { ok: false, error: i18nRef(`${namespace}.error.cipher`) };
  const errorKeys = (wrongLength: string) => ({ invalidType: invalidParamsKey(namespace), wrongLength: `${namespace}.error.${wrongLength}` });
  const key = parseHexOfLength(record['keyHex'], KEY_LENGTHS, errorKeys('keyLength'));
  if (!key.ok) return key;
  const input = parseHexOfLength(record['inputHex'], INPUT_LENGTHS, errorKeys('inputLength'));
  if (!input.ok) return input;
  return { ok: true, value: { cipher, keyHex: key.hex, inputHex: input.hex } };
}

export type PreparedBlockCipher = { ok: true; cipher: BlockCipher; key: Uint8Array } | { ok: false; error: I18nRef };

/** The resolved `BlockCipher` and the decoded key, or a `core.error.portMissing` / `core.error.keyLength` run error. */
export function prepareBlockCipher(resolve: PortResolver | undefined, cipherId: string, keyHex: string): PreparedBlockCipher {
  const port = requirePort(resolve, 'BlockCipher', cipherId);
  if (!port.ok) return port;
  const key = parseHexOrThrow(keyHex);
  const keyError = checkKeyLength(port.port, key);
  return keyError === undefined ? { ok: true, cipher: port.port, key } : { ok: false, error: keyError };
}

/** Run error `errorKey` (`{{blockSize}}`, `{{length}}`) unless `length` is exactly one block. */
export function blockLengthError(cipher: Pick<BlockCipher, 'blockSize'>, length: number, errorKey: string): I18nRef | undefined {
  return length === cipher.blockSize ? undefined : i18nRef(errorKey, { blockSize: cipher.blockSize, length });
}

/** Run error `errorKey` (`{{blockSize}}`, `{{length}}`) unless `length` is a whole number of blocks. */
export function alignmentError(cipher: Pick<BlockCipher, 'blockSize'>, length: number, errorKey: string): I18nRef | undefined {
  return length % cipher.blockSize === 0 ? undefined : i18nRef(errorKey, { blockSize: cipher.blockSize, length });
}

/** Number of blocks `length` bytes occupy (the last one may be partial). */
export function blockCount(length: number, blockSize: number): number {
  return Math.ceil(length / blockSize);
}

/** Byte offsets of block `block` within `length` bytes (the last block may be shorter). */
export function blockIndices(block: number, blockSize: number, length: number): number[] {
  const start = block * blockSize;
  const end = Math.min(start + blockSize, length);
  return Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index);
}

/** Throws when a traced mode's output differs from the untraced core reference (an internal bug, never a user error). */
export function assertMatchesReference(traced: ArrayLike<number>, reference: ArrayLike<number>, what: string): void {
  if (!bytesEqual(traced, reference)) throw new Error(`${what}: the traced output differs from the core reference`);
}

/**
 * Named outputs of ECB/CBC: `ciphertext` when encrypting; when decrypting `plaintext` (no padding,
 * or valid PKCS#7 removed) or `padded` (all decrypted blocks, when the PKCS#7 check failed).
 */
export function blockModeOutputs(direction: ModeDirection, processed: number[], unpad?: Pkcs7UnpadResult): Record<string, number[]> {
  if (direction === 'encrypt') return { ciphertext: processed };
  if (unpad === undefined) return { plaintext: processed };
  return unpad.ok ? { plaintext: Array.from(unpad.data) } : { padded: processed };
}
