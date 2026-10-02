import { createHash } from 'node:crypto';
import type { ParityIssue } from './parity.ts';
import { SOURCE_LOCALE, TARGET_LOCALE } from './parity.ts';

/**
 * Translation freshness (pure, no file I/O): every German page records the SHA-256 of the English
 * page it translates as `sourceHash: sha256:<hex>` in its frontmatter (docs/AUTHORING.md). A missing
 * or outdated hash means the German text may no longer match the English source.
 */

const HASH_PREFIX = 'sha256:';
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const SOURCE_HASH_LINE = /^sourceHash:[ \t]*(.*)$/m;
const TRANSLATION_LINE = /^translation:/m;

/** `sha256:<hex>` of the given bytes, the same value as `shasum -a 256`. */
export function sourceHashOf(bytes: Uint8Array | string): string {
  return `${HASH_PREFIX}${createHash('sha256').update(bytes).digest('hex')}`;
}

function unquote(value: string): string {
  return value.trim().replace(/^(['"])(.*)\1$/, '$2');
}

/** The `sourceHash` frontmatter value of an MDX page, or undefined when absent. */
export function readSourceHash(source: string): string | undefined {
  const frontmatter = FRONTMATTER.exec(source)?.[1];
  const value = frontmatter === undefined ? undefined : SOURCE_HASH_LINE.exec(frontmatter)?.[1];
  return value === undefined || unquote(value) === '' ? undefined : unquote(value);
}

/** Repo-relative EN counterpart of a DE page under `docsRoot`, or undefined for any other path. */
export function englishCounterpart(dePath: string, docsRoot: string): string | undefined {
  const dePrefix = `${docsRoot}/${TARGET_LOCALE}/`;
  return dePath.startsWith(dePrefix) ? `${docsRoot}/${SOURCE_LOCALE}/${dePath.slice(dePrefix.length)}` : undefined;
}

export interface TranslatedPage {
  /** Repo-relative DE page path (used in the report). */
  dePath: string;
  deSource: string;
  /** Raw bytes (or text) of the EN page at the same path. */
  enBytes: Uint8Array | string;
}

function freshnessError(file: string, message: string): ParityIssue {
  return { severity: 'error', file, message };
}

/** Errors for a DE page whose `sourceHash` is missing or no longer matches its EN page. */
export function checkTranslationFreshness(page: TranslatedPage): ParityIssue[] {
  const recorded = readSourceHash(page.deSource);
  if (recorded === undefined) return [freshnessError(page.dePath, 'add sourceHash (run `pnpm i18n:stamp <de-page>` after checking the translation)')];
  if (recorded === sourceHashOf(page.enBytes)) return [];
  return [
    freshnessError(
      page.dePath,
      `German translation is stale: ${page.dePath} — update DE text, re-stamp sourceHash, set translation.status back to ai-reviewed if it was human-reviewed`,
    ),
  ];
}

/**
 * Returns `source` with `sourceHash: <hash>` in its frontmatter: replaces an existing entry, or
 * inserts it before `translation:` (else at the end of the frontmatter). Throws without frontmatter.
 */
export function stampSourceHash(source: string, hash: string): string {
  const match = FRONTMATTER.exec(source);
  if (match?.[1] === undefined) throw new Error('page has no frontmatter');
  const frontmatter = match[1];
  const line = `sourceHash: ${hash}`;
  const stamped = SOURCE_HASH_LINE.test(frontmatter)
    ? frontmatter.replace(SOURCE_HASH_LINE, line)
    : TRANSLATION_LINE.test(frontmatter)
      ? frontmatter.replace(TRANSLATION_LINE, `${line}\ntranslation:`)
      : `${frontmatter}\n${line}`;
  return source.replace(frontmatter, () => stamped);
}
