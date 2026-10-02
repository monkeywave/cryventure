import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_GLYPHS } from './glyphs.ts';

describe('HIGHLIGHT_GLYPHS', () => {
  it('gives every highlight kind a distinct non-empty glyph', () => {
    const glyphs = Object.values(HIGHLIGHT_GLYPHS);
    expect(glyphs.every((glyph) => glyph.length > 0)).toBe(true);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});
