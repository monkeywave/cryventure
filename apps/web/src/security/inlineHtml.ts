/**
 * Pure HTML helpers for the CSP post-build step (docs/M4.md §9): find the inline `<script>` and
 * `<style>` bodies a page carries and write the policy `<meta>` into its `<head>`. No I/O here;
 * `scripts/csp-postbuild.ts` reads and writes the files.
 *
 * Astro's own `security.csp` hashes only the scripts it bundles, not `is:inline` ones (Starlight's
 * theme/sidebar scripts, our lens script, the root redirect), so we hash the built output instead.
 */
import { hashSource, type InlineHashes } from './csp';

/**
 * The attributes of a start tag: anything up to the closing `>`, where a `>` inside a quoted value
 * does not end the tag (`data-x="a>b"`).
 */
const ATTRIBUTES = String.raw`((?:[^>"']|"[^"]*"|'[^']*')*)`;
const SCRIPT_ELEMENT = new RegExp(String.raw`<script\b${ATTRIBUTES}>([\s\S]*?)<\/script\s*>`, 'gi');
const STYLE_ELEMENT = new RegExp(String.raw`<style\b${ATTRIBUTES}>([\s\S]*?)<\/style\s*>`, 'gi');
/** One attribute: its name and an optional double-quoted, single-quoted or unquoted value. */
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
/** `type` values the browser executes as script (empty / absent means classic JavaScript). */
const EXECUTABLE_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript']);
const CSP_META = new RegExp(String.raw`<meta\s+http-equiv=["']?content-security-policy["']?${ATTRIBUTES}>`, 'gi');
const CHARSET_META = new RegExp(String.raw`<meta\s+charset\s*=${ATTRIBUTES}>`, 'i');
const HEAD_OPEN = new RegExp(String.raw`<head\b${ATTRIBUTES}>`, 'i');

/** Attribute names (lower-cased) mapped to their values; the first occurrence wins, as in HTML. */
export function parseAttributes(source: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  for (const [, name = '', double, single, bare] of source.matchAll(ATTRIBUTE)) {
    const key = name.toLowerCase();
    if (!attributes.has(key)) attributes.set(key, double ?? single ?? bare ?? '');
  }
  return attributes;
}

/** The HTML parser turns CRLF/CR into LF before the browser hashes an inline body. */
function normalizeNewlines(body: string): string {
  return body.replace(/\r\n?/g, '\n');
}

function isExecutableInlineScript(source: string): boolean {
  const attributes = parseAttributes(source);
  if (attributes.has('src')) return false;
  return EXECUTABLE_TYPES.has((attributes.get('type') ?? '').trim().toLowerCase());
}

/** Bodies of the inline scripts the browser would run (external and data blocks excluded). */
export function inlineScriptBodies(html: string): string[] {
  return [...html.matchAll(SCRIPT_ELEMENT)]
    .filter(([, attributes = '']) => isExecutableInlineScript(attributes))
    .map(([, , body = '']) => normalizeNewlines(body));
}

/** Bodies of the inline `<style>` elements (inline SVG styles included). */
export function inlineStyleBodies(html: string): string[] {
  return [...html.matchAll(STYLE_ELEMENT)].map(([, , body = '']) => normalizeNewlines(body));
}

/** De-duplicated `'sha256-…'` sources for one page's inline scripts and styles. */
export function collectInlineHashes(html: string): InlineHashes {
  const hashAll = (bodies: string[]) => [...new Set(bodies.map(hashSource))];
  return { scripts: hashAll(inlineScriptBodies(html)), styles: hashAll(inlineStyleBodies(html)) };
}

/** Union of several pages' hashes (the Docker header covers every page). */
export function mergeInlineHashes(all: readonly InlineHashes[]): InlineHashes {
  return {
    scripts: [...new Set(all.flatMap((hashes) => hashes.scripts))],
    styles: [...new Set(all.flatMap((hashes) => hashes.styles))],
  };
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Writes (or replaces) the CSP `<meta>` as early in `<head>` as possible, right after the charset
 * declaration, so it governs every script that follows. Idempotent: a rerun swaps the old tag.
 */
export function injectCspMeta(html: string, policy: string): string {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(policy)}">`;
  const withoutOld = html.replace(CSP_META, '');
  const anchor = CHARSET_META.exec(withoutOld) ?? HEAD_OPEN.exec(withoutOld);
  if (!anchor) throw new Error('no <head> to place the CSP <meta> in');
  const at = anchor.index + anchor[0].length;
  return `${withoutOld.slice(0, at)}${tag}${withoutOld.slice(at)}`;
}
