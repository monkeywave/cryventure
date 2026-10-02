import { xorBytes } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { bytesToNote, clampNoteToBytes, MAX_NOTE_BYTES, noiseGlyphs, noteToBytes, randomKey } from './noteBytes.ts';

describe('noteToBytes / bytesToNote', () => {
  it('encodes ASCII one byte per character', () => {
    expect(Array.from(noteToBytes('Hi!'))).toEqual([0x48, 0x69, 0x21]);
  });

  it('encodes umlauts as two UTF-8 bytes and round-trips', () => {
    const bytes = noteToBytes('Brücke');
    expect(bytes.length).toBe(7);
    expect(bytesToNote(bytes)).toBe('Brücke');
  });

  it('turns invalid UTF-8 into replacement characters instead of throwing', () => {
    expect(bytesToNote(Uint8Array.from([0xff, 0x41]))).toBe('�A');
  });
});

describe('clampNoteToBytes', () => {
  it('keeps a note that fits', () => {
    expect(clampNoteToBytes('Meet me at the bridge')).toBe('Meet me at the bridge');
  });

  it('cuts at the byte limit', () => {
    expect(noteToBytes(clampNoteToBytes('x'.repeat(40))).length).toBe(MAX_NOTE_BYTES);
  });

  it('never splits a multi-byte character', () => {
    expect(clampNoteToBytes('aü', 2)).toBe('a');
    expect(clampNoteToBytes('😀😀', 6)).toBe('😀');
  });
});

describe('randomKey', () => {
  it('has one byte per note byte and uses the given random source', () => {
    const key = randomKey(4, (bytes) => bytes.fill(7));
    expect(Array.from(key)).toEqual([7, 7, 7, 7]);
  });

  it('defaults to crypto.getRandomValues', () => {
    expect(randomKey(16)).toHaveLength(16);
  });
});

describe('one-time pad round trip', () => {
  it('XORing twice with the same key recovers the note', () => {
    const note = noteToBytes('Treffen an der Brücke');
    const key = randomKey(note.length);
    expect(bytesToNote(xorBytes(xorBytes(note, key), key))).toBe('Treffen an der Brücke');
  });
});

describe('noiseGlyphs', () => {
  it('shows printable ASCII as itself and other bytes as block glyphs', () => {
    const glyphs = noiseGlyphs([0x41, 0x20, 0x00, 0xff]);
    expect(glyphs[0]).toBe('A');
    expect(glyphs.slice(1).every((glyph) => /[^\x20-\x7e]/.test(glyph))).toBe(true);
  });

  it('returns one glyph per byte', () => {
    expect(noiseGlyphs(new Uint8Array(32))).toHaveLength(32);
  });
});
