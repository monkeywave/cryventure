/** URL-safe base64 (RFC 4648 §5, no padding) of UTF-8 JSON, used for lab params in the URL hash. */

export type DecodeResult<T> = { ok: true; value: T } | { ok: false };

const BASE64URL = /^[A-Za-z0-9_-]*$/;

export function encodeBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns `undefined` for anything that is not unpadded base64url. */
export function decodeBase64Url(text: string): Uint8Array | undefined {
  if (!BASE64URL.test(text) || text.length % 4 === 1) return undefined;
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  } catch {
    return undefined;
  }
}

export function encodeJsonBase64Url(value: unknown): string {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

/** Tolerant: bad base64, bad UTF-8 or bad JSON all yield `{ ok: false }`. */
export function decodeJsonBase64Url(text: string): DecodeResult<unknown> {
  const bytes = decodeBase64Url(text);
  if (bytes === undefined) return { ok: false };
  try {
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(json) as unknown };
  } catch {
    return { ok: false };
  }
}
