import type { WireRole } from '@cryventure/core';

/** Data roles that carry a non-colour glyph: the wire roles plus GCM's GHASH accumulator and length block. */
export type GlyphRole = WireRole | 'hash' | 'length';

/**
 * Non-colour cue per data role (PLAN §3), shared by the wire and mode-chain views so a role reads the
 * same everywhere. Decorative only (the role is also said in words): ⚄ nonce/IV randomness, ◆
 * ciphertext, ◇ plaintext, ░ padding; GCM (docs/M4.md §3f): ✓ the tag that authenticates, ◇✓ AAD
 * (sent in the clear, but authenticated), ⊗ the GHASH multiply by H, ‖ the length block len(A) ‖ len(C).
 */
export const ROLE_GLYPHS: Readonly<Record<GlyphRole, string>> = {
  iv: '⚄',
  nonce: '⚄',
  ciphertext: '◆',
  plaintext: '◇',
  padding: '░',
  tag: '✓',
  aad: '◇✓',
  hash: '⊗',
  length: '‖',
};
