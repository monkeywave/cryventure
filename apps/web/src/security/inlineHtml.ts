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
/**
 * The tokens that decide what an inline body is: comments (skipped), `<script>`/`<style>` elements
 * (groups 1-3: name, attributes, body) and `<svg>`/`<math>` tags (groups 4-6: slash, name,
 * attributes) that open or close foreign content. Script/style bodies are consumed whole, so an
 * `<svg` inside them does not count.
 */
const TOKEN = new RegExp(
  String.raw`<!--[\s\S]*?-->` +
    String.raw`|<(script|style)\b${ATTRIBUTES}>([\s\S]*?)<\/\1\s*>` +
    String.raw`|<(\/?)(svg|math)\b${ATTRIBUTES}>`,
  'gi',
);
/**
 * Text the foreign-content (SVG/MathML) parser would rewrite before the browser hashes it: character
 * references (`&gt;`), CDATA sections and nested tags (`<`), and NUL (becomes U+FFFD).
 */
const FOREIGN_REWRITTEN = /[&<\0]/;
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

/** One inline `<script>`/`<style>` element in document order. */
interface InlineElement {
  readonly tag: 'script' | 'style';
  readonly attributes: string;
  readonly body: string;
  /** The open `<svg>`/`<math>` around it, if any (foreign content). */
  readonly foreignRoot: 'svg' | 'math' | undefined;
}

/** Every inline `<script>`/`<style>` with the foreign-content root it sits in, if any. */
function inlineElements(html: string): InlineElement[] {
  const elements: InlineElement[] = [];
  const open: ('svg' | 'math')[] = [];
  for (const [, tag, attributes = '', body = '', slash, root, rootAttributes = ''] of html.matchAll(TOKEN)) {
    if (tag !== undefined) {
      const name = tag.toLowerCase() as InlineElement['tag'];
      elements.push({ tag: name, attributes, body, foreignRoot: open.at(-1) });
    } else if (root !== undefined) {
      updateForeignStack(open, root.toLowerCase() as 'svg' | 'math', slash === '/', rootAttributes);
    }
  }
  return elements;
}

function updateForeignStack(open: ('svg' | 'math')[], root: 'svg' | 'math', closing: boolean, attributes: string) {
  if (closing) {
    const at = open.lastIndexOf(root);
    if (at !== -1) open.length = at;
  } else if (!attributes.trimEnd().endsWith('/')) {
    open.push(root);
  }
}

/**
 * The text the browser hashes. In HTML a `<script>`/`<style>` body is raw text, so it is the source
 * as written (newlines normalised). In SVG/MathML (foreign content) the parser decodes character
 * references and CDATA and parses tags first; we do not re-implement that, so a body it would
 * rewrite fails the build instead of yielding a hash the browser would never match.
 */
function hashedText({ tag, body, foreignRoot }: InlineElement): string {
  if (foreignRoot !== undefined && FOREIGN_REWRITTEN.test(body)) {
    throw new Error(
      `CSP: inline <${tag}> inside <${foreignRoot}> contains an entity, CDATA, tag or NUL, which the ` +
        `browser decodes before hashing; move it out of the <${foreignRoot}> or drop those characters: ` +
        JSON.stringify(body.slice(0, 80)),
    );
  }
  return normalizeNewlines(body);
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
  return inlineElements(html)
    .filter((element) => element.tag === 'script' && isExecutableInlineScript(element.attributes))
    .map(hashedText);
}

/**
 * Bodies of the inline `<style>` elements, as the browser hashes them. Styles inside inline SVG are
 * included when their text needs no foreign-content decoding; otherwise this throws (see `hashedText`).
 */
export function inlineStyleBodies(html: string): string[] {
  return inlineElements(html).filter((element) => element.tag === 'style').map(hashedText);
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
