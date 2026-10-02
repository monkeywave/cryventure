/** A reference to a translatable message. The engine never emits prose, only refs. */
export interface I18nRef {
  key: string;
  params?: Record<string, string | number>;
}

/** Flat dotted-key message table, e.g. `{ "core.error.hexOddLength": "..." }`. */
export type Messages = Record<string, string>;

export type TranslateParams = Record<string, string | number>;

export type Translate = (keyOrRef: string | I18nRef, params?: TranslateParams) => string;

export interface TranslatorOptions {
  onMissing?: (key: string) => void;
  /** BCP-47 locale used to pick plural forms via `Intl.PluralRules` (default `en`). */
  locale?: string;
}

/** Plural-form key suffixes (`<key>_one`, `<key>_other`, …), following `Intl.PluralRules` categories. */
export const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

const PLURAL_SUFFIX = new RegExp(`_(${PLURAL_CATEGORIES.join('|')})$`);

/** Splits `ui.x_one` into `{ base: 'ui.x', category: 'one' }`; `undefined` for a non-plural key. */
export function parsePluralKey(key: string): { base: string; category: PluralCategory } | undefined {
  const match = PLURAL_SUFFIX.exec(key);
  if (match === null) return undefined;
  return { base: key.slice(0, match.index), category: match[1] as PluralCategory };
}

const pluralRulesCache = new Map<string, Intl.PluralRules>();

function pluralRulesFor(locale: string): Intl.PluralRules {
  const cached = pluralRulesCache.get(locale);
  if (cached !== undefined) return cached;
  const rules = new Intl.PluralRules(locale);
  pluralRulesCache.set(locale, rules);
  return rules;
}

/**
 * Candidate keys in lookup order. With a numeric `count`: `_zero` (only for 0, an explicit override),
 * the locale's category (`_one`, …), `_other`, then the bare key. Without one: the bare key, then `_other`.
 */
export function pluralCandidates(key: string, count: unknown, locale: string): string[] {
  if (typeof count !== 'number' || !Number.isFinite(count)) return [key, `${key}_other`];
  const category = pluralRulesFor(locale).select(count);
  const zero = count === 0 ? [`${key}_zero`] : [];
  return [...new Set([...zero, `${key}_${category}`, `${key}_other`, key])];
}

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

/** Replaces `{{name}}` placeholders; unknown placeholders are left untouched. */
export function interpolate(template: string, params: TranslateParams = {}): string {
  return template.replace(PLACEHOLDER, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

/** Lists the distinct `{{param}}` names used in a template, in first-seen order. */
export function extractParams(template: string): string[] {
  const names = Array.from(template.matchAll(PLACEHOLDER), (match) => match[1] ?? '');
  return [...new Set(names)];
}

/** The catalog key `t(key, params)` would use (plural form included), or `undefined` when none exists. */
export function resolveMessageKey(messages: Messages, key: string, params: TranslateParams = {}, locale = 'en'): string | undefined {
  return pluralCandidates(key, params.count, locale).find((candidate) => Object.hasOwn(messages, candidate));
}

/**
 * Builds a tiny `t(key, params)`; a missing key returns the key itself. When `params.count` is a
 * number and `<key>_one` / `<key>_other` (…) exist, the plural form for `options.locale` is used.
 */
export function createTranslator(messages: Messages, options: TranslatorOptions = {}): Translate {
  const locale = options.locale ?? 'en';
  return (keyOrRef, params) => {
    const ref = typeof keyOrRef === 'string' ? { key: keyOrRef } : keyOrRef;
    const merged = { ...ref.params, ...params };
    const found = resolveMessageKey(messages, ref.key, merged, locale);
    if (found === undefined) {
      options.onMissing?.(ref.key);
      return ref.key;
    }
    return interpolate(messages[found] ?? ref.key, merged);
  };
}

/** Convenience constructor for an `I18nRef`. */
export function i18nRef(key: string, params?: TranslateParams): I18nRef {
  return params === undefined ? { key } : { key, params };
}
