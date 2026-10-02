/** Byte-level helpers for the prologue: the note as UTF-8, a random one-time key and how Eve "reads" bytes. */

export const MAX_NOTE_BYTES = 32;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

export function noteToBytes(text: string): Uint8Array {
  return encoder.encode(text);
}

/** Decodes UTF-8; invalid sequences become U+FFFD, so any byte string yields some text. */
export function bytesToNote(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/** The longest prefix of `text` (whole code points) that fits into `maxBytes` UTF-8 bytes. */
export function clampNoteToBytes(text: string, maxBytes: number = MAX_NOTE_BYTES): string {
  let used = 0;
  let kept = '';
  for (const codePoint of text) {
    used += encoder.encode(codePoint).length;
    if (used > maxBytes) break;
    kept += codePoint;
  }
  return kept;
}

export type FillRandom = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;

const fillWithCrypto: FillRandom = (bytes) => crypto.getRandomValues(bytes);

/** A fresh one-time key: one uniformly random byte per note byte. */
export function randomKey(length: number, fill: FillRandom = fillWithCrypto): Uint8Array {
  return fill(new Uint8Array(length));
}

/** Glyphs that stand in for bytes that are not printable ASCII: they look like the noise they are. */
const NOISE_GLYPHS = ['░', '▒', '▓', '▚', '▞', '▙', '▟', '▜', '▛', '◆', '◇', '¤', '§', '¶', '×', '¿'];

const isPrintableAscii = (byte: number): boolean => byte >= 0x21 && byte <= 0x7e;

/**
 * How Eve sees bytes when she tries to read them as text, one glyph per byte: printable ASCII as
 * itself, everything else (control bytes, spaces, high bytes) as a block glyph chosen by the byte.
 */
export function noiseGlyphs(bytes: ArrayLike<number>): string[] {
  return Array.from(bytes, (byte) => (isPrintableAscii(byte) ? String.fromCharCode(byte) : (NOISE_GLYPHS[byte % NOISE_GLYPHS.length] ?? '░')));
}
