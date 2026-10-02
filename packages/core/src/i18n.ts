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

/** Builds a tiny `t(key, params)`; a missing key returns the key itself. */
export function createTranslator(messages: Messages, options: TranslatorOptions = {}): Translate {
  return (keyOrRef, params) => {
    const ref = typeof keyOrRef === 'string' ? { key: keyOrRef } : keyOrRef;
    const template = Object.hasOwn(messages, ref.key) ? messages[ref.key] : undefined;
    if (template === undefined) {
      options.onMissing?.(ref.key);
      return ref.key;
    }
    return interpolate(template, { ...ref.params, ...params });
  };
}

/** Convenience constructor for an `I18nRef`. */
export function i18nRef(key: string, params?: TranslateParams): I18nRef {
  return params === undefined ? { key } : { key, params };
}
