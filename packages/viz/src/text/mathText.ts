/**
 * Caret exponents in translated text (`a^3`, `x^(n−1)`, `x^{n+1}`) as superscripts. Shared by the
 * math view, the narration view and the player caption. Pure: no React, no i18n.
 */

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** Unicode superscript per character an exponent may contain (digits, signs, a few letters). */
const SUPERSCRIPT_CHARS: Readonly<Record<string, string>> = {
  ...Object.fromEntries([...SUPERSCRIPT_DIGITS].map((glyph, digit) => [String(digit), glyph])),
  '-': '⁻',
  '−': '⁻',
  '+': '⁺',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  i: 'ⁱ',
  n: 'ⁿ',
  x: 'ˣ',
};

/** A piece of text: plain, or an exponent with no Unicode superscript form (render as `<sup>`). */
export type MathTextSegment = { text: string; sup: boolean };

/** `^{e}`, `^(e)` or `^e` (a signed number or a single letter). */
const CARET_EXPONENT = /\^(?:\{([^}]*)\}|\(([^)]*)\)|([−-]?\d+|[a-z]))/g;

/** The exponent in Unicode superscript glyphs (whitespace dropped), or undefined if a glyph is missing. */
export function toSuperscript(exponent: string): string | undefined {
  const glyphs = [...exponent.replace(/\s+/g, '')].map((char) => SUPERSCRIPT_CHARS[char]);
  return glyphs.every((glyph) => glyph !== undefined) ? glyphs.join('') : undefined;
}

/**
 * Caret exponents of a translated formula, label or narration as superscripts: `a^254` → `a²⁵⁴`,
 * `a·x^(3−1)` → `a·x³⁻¹` (the raised exponent groups it, so the parentheses go). Exponents without a
 * Unicode superscript form come back as `sup` segments. Adjacent plain text is merged.
 */
export function mathTextSegments(text: string): MathTextSegment[] {
  const segments: MathTextSegment[] = [];
  const pushPlain = (plain: string) => {
    if (plain === '') return;
    const last = segments.at(-1);
    if (last !== undefined && !last.sup) last.text += plain;
    else segments.push({ text: plain, sup: false });
  };
  let cursor = 0;
  for (const match of text.matchAll(CARET_EXPONENT)) {
    pushPlain(text.slice(cursor, match.index));
    const exponent = match[1] ?? match[2] ?? match[3] ?? '';
    const raised = toSuperscript(exponent);
    if (raised === undefined) segments.push({ text: exponent, sup: true });
    else pushPlain(raised);
    cursor = match.index + match[0].length;
  }
  pushPlain(text.slice(cursor));
  return segments;
}
