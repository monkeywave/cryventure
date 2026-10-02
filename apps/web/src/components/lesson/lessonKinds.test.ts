import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LESSON_KIND,
  LESSON_KINDS,
  LESSON_KIND_GLYPHS,
  lessonKindGlyph,
} from './lessonKinds.ts';

describe('lessonKinds', () => {
  it('keeps the established glyphs', () => {
    expect(LESSON_KIND_GLYPHS).toMatchObject({
      key: '⚷',
      plaintext: 'P',
      ciphertext: 'C',
      state: '▦',
      constant: 'π',
    });
  });

  it('supports nonce, tag and subkey with distinct glyphs', () => {
    expect(LESSON_KINDS).toEqual(expect.arrayContaining(['nonce', 'tag', 'subkey']));
    const glyphs = LESSON_KINDS.map(lessonKindGlyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
    glyphs.forEach((glyph) => expect(glyph).not.toBe(''));
  });

  it('defaults to state', () => {
    expect(DEFAULT_LESSON_KIND).toBe('state');
  });
});
