import { extractParams } from '@cryventure/core';

/** Pure EN↔DE parity rules (no I/O); `check-parity.ts` feeds them files from disk. */
export type Severity = 'error' | 'warning';

export interface ParityIssue {
  severity: Severity;
  /** Repo-relative file (the EN side for catalog pairs). */
  file: string;
  key?: string;
  message: string;
}

export type FlatCatalog = Record<string, unknown>;

export const SOURCE_LOCALE = 'en';
export const TARGET_LOCALE = 'de';

/** Words that legitimately read the same in EN and DE (proper nouns, acronyms, shared words). */
export const SAME_IN_BOTH_LOCALES: ReadonlySet<string> = new Set([
  'CryVenture',
  'AES',
  'FIPS',
  'XOR',
  'GF',
  'SHA',
  'HMAC',
  'HKDF',
  'GCM',
  'ECB',
  'CBC',
  'CTR',
  'TLS',
  'SSH',
  'GitHub',
  'Starlight',
  'OK',
  'Pause',
  'Debugger',
  // FIPS 197 transformation names
  'KeyExpansion',
  'AddRoundKey',
  'SubBytes',
  'ShiftRows',
  'MixColumns',
  'InvSubBytes',
  'InvShiftRows',
  'InvMixColumns',
]);

/** Prefix the scaffolder gives DE stubs; flagged until someone translates them. */
export const UNTRANSLATED_PREFIX = '[DE]';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Flattens nested message objects into dotted keys; flat catalogs pass through unchanged. */
export function flattenCatalog(json: unknown, prefix = ''): FlatCatalog {
  if (!isPlainObject(json)) return prefix === '' ? {} : { [prefix]: json };
  return Object.entries(json).reduce<FlatCatalog>((flat, [key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    return { ...flat, ...(isPlainObject(value) ? flattenCatalog(value, path) : { [path]: value }) };
  }, {});
}

const PLACEHOLDER = /\{\{[^}]*\}\}/g;
const TOKEN = /[\p{L}\p{N}]+/gu;
const HAS_LETTER = /\p{L}/u;
const HEX_LIKE = /^(?:0x)?[0-9a-f]+$/i;

/** True when an identical EN/DE value is expected (no words, hex, or only allowlisted words). */
export function isTranslationExempt(value: string, allowlist: ReadonlySet<string> = SAME_IN_BOTH_LOCALES): boolean {
  const text = value.replace(PLACEHOLDER, ' ');
  const tokens = text.match(TOKEN) ?? [];
  return tokens.every((token) => !HAS_LETTER.test(token) || HEX_LIKE.test(token) || allowlist.has(token));
}

function issue(severity: Severity, file: string, key: string, message: string): ParityIssue {
  return { severity, file, key, message };
}

function presenceIssues(en: FlatCatalog, de: FlatCatalog, file: string): ParityIssue[] {
  const missing = Object.keys(en)
    .filter((key) => !Object.hasOwn(de, key))
    .map((key) => issue('error', file, key, `missing in ${TARGET_LOCALE}`));
  const extra = Object.keys(de)
    .filter((key) => !Object.hasOwn(en, key))
    .map((key) => issue('error', file, key, `extra in ${TARGET_LOCALE} (not in ${SOURCE_LOCALE})`));
  return [...missing, ...extra];
}

function valueIssues(catalog: FlatCatalog, locale: string, file: string): ParityIssue[] {
  return Object.entries(catalog).flatMap(([key, value]) => {
    if (typeof value !== 'string') return [issue('error', file, key, `not a string in ${locale}`)];
    return value.trim() === '' ? [issue('error', file, key, `empty in ${locale}`)] : [];
  });
}

function sortedParams(value: string): string {
  return extractParams(value).sort().join(', ');
}

function pairIssues(en: FlatCatalog, de: FlatCatalog, file: string): ParityIssue[] {
  return Object.entries(en).flatMap(([key, enValue]) => {
    const deValue = de[key];
    if (typeof enValue !== 'string' || typeof deValue !== 'string') return [];
    if (sortedParams(enValue) !== sortedParams(deValue)) {
      return [issue('error', file, key, `{{params}} differ: en [${sortedParams(enValue)}] vs de [${sortedParams(deValue)}]`)];
    }
    if (deValue.startsWith(UNTRANSLATED_PREFIX)) return [issue('warning', file, key, 'untranslated scaffold stub in de')];
    if (deValue === enValue && !isTranslationExempt(enValue)) return [issue('warning', file, key, 'de value is identical to en')];
    return [];
  });
}

/** Missing/extra/empty keys and `{{param}}` mismatches are errors; identical or stub DE values warn. */
export function compareCatalogs(en: FlatCatalog, de: FlatCatalog, file: string): ParityIssue[] {
  return [
    ...presenceIssues(en, de, file),
    ...valueIssues(en, SOURCE_LOCALE, file),
    ...valueIssues(de, TARGET_LOCALE, file),
    ...pairIssues(en, de, file),
  ];
}

/** Swaps the locale in `…/en.json` or `…/en/<ns>.json` (last locale segment wins); else undefined. */
export function swapLocale(path: string, from: string, to: string): string | undefined {
  const segments = path.split('/');
  const last = segments.length - 1;
  if (segments[last] === `${from}.json`) return [...segments.slice(0, last), `${to}.json`].join('/');
  const dirIndex = segments.lastIndexOf(from);
  if (dirIndex < 0 || dirIndex === last) return undefined;
  return segments.map((segment, index) => (index === dirIndex ? to : segment)).join('/');
}

export interface CatalogPairs {
  pairs: Array<{ en: string; de: string }>;
  issues: ParityIssue[];
}

function orphanIssue(file: string, missingLocale: string): ParityIssue {
  return { severity: 'error', file, message: `no ${missingLocale} counterpart` };
}

/** Pairs EN and DE catalog paths; a file without its counterpart is an error. */
export function pairCatalogPaths(paths: readonly string[]): CatalogPairs {
  const available = new Set(paths);
  const isLocale = (locale: string) => (path: string) => swapLocale(path, locale, locale) === path;
  const enPaths = paths.filter(isLocale(SOURCE_LOCALE));
  const dePaths = paths.filter(isLocale(TARGET_LOCALE));
  const pairs = enPaths.flatMap((en) => {
    const de = swapLocale(en, SOURCE_LOCALE, TARGET_LOCALE);
    return de !== undefined && available.has(de) ? [{ en, de }] : [];
  });
  const paired = new Set(pairs.flatMap((pair) => [pair.en, pair.de]));
  const issues = [
    ...enPaths.filter((path) => !paired.has(path)).map((path) => orphanIssue(path, TARGET_LOCALE)),
    ...dePaths.filter((path) => !paired.has(path)).map((path) => orphanIssue(path, SOURCE_LOCALE)),
  ];
  return { pairs, issues };
}

/** Pages (relative to their locale root) that exist in only one locale. */
export function compareDocTrees(enPages: readonly string[], dePages: readonly string[], docsRoot: string): ParityIssue[] {
  const enSet = new Set(enPages);
  const deSet = new Set(dePages);
  const onlyIn = (pages: readonly string[], other: Set<string>, locale: string, missing: string) =>
    pages
      .filter((page) => !other.has(page))
      .map((page) => orphanIssue(`${docsRoot}/${locale}/${page}`, missing));
  return [...onlyIn(enPages, deSet, SOURCE_LOCALE, TARGET_LOCALE), ...onlyIn(dePages, enSet, TARGET_LOCALE, SOURCE_LOCALE)];
}

export function hasErrors(issues: readonly ParityIssue[]): boolean {
  return issues.some((entry) => entry.severity === 'error');
}

/** One line per issue, errors first, e.g. `error   a/en.json  plugin.x.title: missing in de`. */
export function formatIssues(issues: readonly ParityIssue[]): string[] {
  const rank = (entry: ParityIssue) => (entry.severity === 'error' ? 0 : 1);
  return [...issues]
    .sort((a, b) => rank(a) - rank(b))
    .map((entry) => `${entry.severity.padEnd(7)} ${entry.file}  ${entry.key === undefined ? '' : `${entry.key}: `}${entry.message}`);
}
