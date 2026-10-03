/**
 * Original flat-colour penguin for the PenguinLab (drawn for CryVenture, no third-party artwork).
 * Large areas of one exact colour, and `crispEdges` against anti-aliasing, so that ECB keeps the
 * outline: equal 16-byte runs of pixels encrypt to equal ciphertext blocks.
 */

/** Side length of the rasterised penguin, in pixels. 192 × 3 = 576 bytes per row = 36 AES blocks. */
export const PENGUIN_SIZE = 192;

const SKY = '#bfe0f2';
const ICE = '#f1f7fb';
const INK = '#1b1f2a';
const BELLY = '#fbfbf8';
const BEAK = '#f59e0b';
const SCARF = '#d62839';

export const PENGUIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${PENGUIN_SIZE}" height="${PENGUIN_SIZE}" viewBox="0 0 192 192" shape-rendering="crispEdges">
<rect width="192" height="192" fill="${SKY}"/>
<rect y="158" width="192" height="34" fill="${ICE}"/>
<ellipse cx="54" cy="112" rx="14" ry="40" fill="${INK}" transform="rotate(18 54 112)"/>
<ellipse cx="138" cy="112" rx="14" ry="40" fill="${INK}" transform="rotate(-18 138 112)"/>
<ellipse cx="96" cy="112" rx="48" ry="60" fill="${INK}"/>
<circle cx="96" cy="56" r="34" fill="${INK}"/>
<ellipse cx="96" cy="122" rx="33" ry="46" fill="${BELLY}"/>
<ellipse cx="82" cy="54" rx="11" ry="13" fill="${BELLY}"/>
<ellipse cx="110" cy="54" rx="11" ry="13" fill="${BELLY}"/>
<circle cx="84" cy="56" r="5" fill="${INK}"/>
<circle cx="108" cy="56" r="5" fill="${INK}"/>
<polygon points="84,68 108,68 96,82" fill="${BEAK}"/>
<rect x="60" y="86" width="72" height="12" fill="${SCARF}"/>
<rect x="112" y="92" width="12" height="30" fill="${SCARF}"/>
<ellipse cx="78" cy="170" rx="16" ry="7" fill="${BEAK}"/>
<ellipse cx="114" cy="170" rx="16" ry="7" fill="${BEAK}"/>
</svg>`;

/** The penguin as a `data:` URL (allowed by the CSP's `img-src data:`), ready for an `<img>` or `Image`. */
export const PENGUIN_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PENGUIN_SVG)}`;
