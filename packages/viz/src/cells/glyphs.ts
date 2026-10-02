import type { HighlightKind } from '@cryventure/core';

/** Non-colour cue per highlight kind (PLAN §3: colour is never the only signal). Decorative only. */
export const HIGHLIGHT_GLYPHS: Readonly<Record<HighlightKind, string>> = {
  read: '◦',
  write: '•',
  xor: '⊕',
  sbox: 'S',
  move: '↔',
  carry: '+',
  constant: 'π',
};
