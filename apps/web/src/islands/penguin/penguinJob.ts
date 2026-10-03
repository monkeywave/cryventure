import {
  cbcEncrypt,
  checkKeyLength,
  ecbEncrypt,
  i18nRef,
  pkcs7Pad,
  preparePorts,
  requirePort,
  type BlockCipher,
  type I18nRef,
  type ParamFieldSource,
  type ProducerLookup,
} from '@cryventure/core';

/**
 * The PenguinLab worker's job (docs/M3.md §9), kept free of worker globals so it is unit-tested:
 * resolve the block cipher through the producer registry (`preparePorts`), then encrypt the image's
 * RGB bytes with the shared `core/modes` reference.
 *
 * Padding: the RGB stream is padded with PKCS#7 to whole blocks, as a real file encryption would.
 * The island draws only the first `width × height × 3` ciphertext bytes, so the padded tail of the
 * last block is computed but not shown.
 */

export type PenguinMode = 'ecb' | 'cbc';

export const PENGUIN_MODES: readonly PenguinMode[] = ['ecb', 'cbc'];

/** The cipher the lab resolves; a producer id implementing `BlockCipher`. */
export const PENGUIN_CIPHER_ID = 'aes';

export interface PenguinRequest {
  mode: PenguinMode;
  key: Uint8Array;
  /** Used by CBC only (one block). */
  iv: Uint8Array;
  /** The image's pixels as `r,g,b` bytes (alpha dropped). */
  rgb: Uint8Array;
}

export type PenguinResponse = { ok: true; ciphertext: Uint8Array } | { ok: false; error: I18nRef };

/** A one-field param source, so the lab resolves its cipher exactly like a mode producer's `cipher` param. */
const PENGUIN_PORT_PARAMS: ParamFieldSource = {
  paramFields: [{ name: 'cipher', kind: 'port', port: 'BlockCipher', labelKey: 'ui.penguin.cipher' }],
  defaults: { cipher: PENGUIN_CIPHER_ID },
  i18nNamespace: 'ui.penguin',
};

/** PKCS#7-pads `rgb` and encrypts it with `cipher` in `mode` (no tracing). */
export function encryptRgb(cipher: BlockCipher, request: Pick<PenguinRequest, 'mode' | 'key' | 'iv' | 'rgb'>): Uint8Array {
  const padded = pkcs7Pad(request.rgb, cipher.blockSize);
  return request.mode === 'ecb' ? ecbEncrypt(cipher, request.key, padded) : cbcEncrypt(cipher, request.key, request.iv, padded);
}

/** Resolves the cipher and encrypts; every failure becomes an i18n error, never a throw. */
export async function runPenguinJob(request: PenguinRequest, producers: ProducerLookup): Promise<PenguinResponse> {
  const resolve = await preparePorts(PENGUIN_PORT_PARAMS, { cipher: PENGUIN_CIPHER_ID }, producers);
  const cipher = requirePort(resolve, 'BlockCipher', PENGUIN_CIPHER_ID);
  if (!cipher.ok) return { ok: false, error: cipher.error };
  const keyError = checkKeyLength(cipher.port, request.key);
  if (keyError !== undefined) return { ok: false, error: keyError };
  try {
    return { ok: true, ciphertext: encryptRgb(cipher.port, request) };
  } catch {
    return { ok: false, error: i18nRef('ui.penguin.error.encryptFailed') };
  }
}
