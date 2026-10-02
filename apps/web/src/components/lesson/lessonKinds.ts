import type { ValueRole } from '@cryventure/core';

/**
 * Data roles a lesson component can colour-code, derived from the core `ValueRole`.
 * `secret`/`public` are left out until they get their own --cv-* tokens.
 */
export type LessonKind = Extract<
  ValueRole,
  'key' | 'subkey' | 'nonce' | 'plaintext' | 'ciphertext' | 'state' | 'constant' | 'tag'
>;

/** Non-colour cue per kind (rendered aria-hidden), so colour is never the only signal. */
export const LESSON_KIND_GLYPHS: Readonly<Record<LessonKind, string>> = {
  key: '⚷',
  subkey: '⚿',
  nonce: 'N',
  plaintext: 'P',
  ciphertext: 'C',
  state: '▦',
  constant: 'π',
  tag: 'T',
};

export const LESSON_KINDS = Object.keys(LESSON_KIND_GLYPHS) as readonly LessonKind[];

export const DEFAULT_LESSON_KIND: LessonKind = 'state';

export function lessonKindGlyph(kind: LessonKind): string {
  return LESSON_KIND_GLYPHS[kind];
}
