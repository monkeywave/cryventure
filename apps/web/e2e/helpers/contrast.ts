/**
 * WCAG 2.x contrast math for e2e checks (pure; no browser APIs). Colours come from `getComputedStyle`,
 * i.e. `rgb(r, g, b)`, `rgba(r, g, b, a)` or the space-separated `rgb(r g b / a)` form.
 */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0 … 1 */
  a: number;
}

export const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

const RGB_PATTERN = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/;

function parseAlpha(alpha: string | undefined): number {
  if (alpha === undefined) return 1;
  return alpha.endsWith('%') ? parseFloat(alpha) / 100 : parseFloat(alpha);
}

/** Parses a computed `rgb()` / `rgba()` colour; `transparent` is fully transparent black. */
export function parseCssColor(value: string): Rgba {
  const color = value.trim();
  if (color === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const match = RGB_PATTERN.exec(color);
  if (match === null) throw new Error(`unsupported colour: ${value}`);
  const [, r, g, b, alpha] = match;
  return { r: Number(r), g: Number(g), b: Number(b), a: parseAlpha(alpha) };
}

/** Source-over compositing of `top` onto an opaque `bottom`. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const mix = (front: number, back: number) => front * top.a + back * (1 - top.a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

/**
 * The opaque colour behind an element: its own and its ancestors' background colours, innermost
 * first, composited from the first opaque one (or `base`, the canvas) upwards.
 */
export function effectiveBackground(layers: readonly Rgba[], base: Rgba = WHITE): Rgba {
  const opaqueAt = layers.findIndex((layer) => layer.a >= 1);
  const visible = opaqueAt === -1 ? layers : layers.slice(0, opaqueAt + 1);
  return visible.reduceRight<Rgba>((below, layer) => composite(layer, below), base);
}

function channelLuminance(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an opaque colour. */
export function relativeLuminance({ r, g, b }: Rgba): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** WCAG contrast ratio (1 … 21) of a possibly translucent foreground over an opaque background. */
export function contrastRatio(foreground: Rgba, background: Rgba): number {
  const text = relativeLuminance(composite(foreground, background));
  const behind = relativeLuminance(background);
  return (Math.max(text, behind) + 0.05) / (Math.min(text, behind) + 0.05);
}
