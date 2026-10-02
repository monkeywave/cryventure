import { mathTextSegments } from './mathText.ts';

/**
 * Translated text with caret exponents raised: Unicode superscripts (read by screen readers as
 * the digits/"superscript", never as a caret), `<sup>` where a glyph has no superscript form.
 */
export function MathText({ text }: { text: string }) {
  return (
    <>
      {mathTextSegments(text).map((segment, index) =>
        segment.sup ? <sup key={index}>{segment.text}</sup> : segment.text,
      )}
    </>
  );
}
