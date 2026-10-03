import { describe, expect, it } from 'vitest';
import { ROLE_GLYPHS } from './roleGlyphs.ts';

describe('ROLE_GLYPHS', () => {
  it('gives every glyph role one distinct cue, nonce and IV sharing the dice', () => {
    expect(ROLE_GLYPHS.iv).toBe(ROLE_GLYPHS.nonce);
    const { iv: _iv, ...rest } = ROLE_GLYPHS;
    expect(new Set(Object.values(rest)).size).toBe(Object.keys(rest).length);
  });
});
