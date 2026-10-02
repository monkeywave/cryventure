import type { Messages } from './i18n.ts';

/** Locales every catalog must provide (docs/PLAN.md §5). */
export const supportedLocales = ['en', 'de'] as const;
export type Locale = (typeof supportedLocales)[number];
export const defaultLocale: Locale = 'en';

export function isLocale(value: string | undefined): value is Locale {
  return (supportedLocales as readonly string[]).includes(value ?? '');
}

/** Narrows any BCP-47-ish tag (e.g. "de-AT") to a supported locale, falling back to the default. */
export function toLocale(tag: string | undefined): Locale {
  const primary = tag?.toLowerCase().split('-')[0];
  return isLocale(primary) ? primary : defaultLocale;
}

const CATALOG_PATH = /(?:^|\/)([^/]+)\/i18n\/([^/]+)\.json$/;

export interface CatalogPath {
  /** The folder owning the catalog, e.g. the plugin id `aes`. */
  folder: string;
  locale: string;
}

/** Parses `…/<folder>/i18n/<locale>.json`; `undefined` for any other path. */
export function parseCatalogPath(path: string): CatalogPath | undefined {
  const match = CATALOG_PATH.exec(path);
  return match ? { folder: match[1] ?? '', locale: match[2] ?? '' } : undefined;
}

/**
 * Merges the catalogs of one locale from a path-keyed module map (e.g. an `import.meta.glob`
 * result); `folder` restricts the merge to one owner folder.
 */
export function mergeCatalogs(catalogs: Record<string, Messages>, locale: Locale, folder?: string): Messages {
  const matches = (path: string) => {
    const parsed = parseCatalogPath(path);
    return parsed?.locale === locale && (folder === undefined || parsed.folder === folder);
  };
  return Object.assign({}, ...Object.entries(catalogs).filter(([path]) => matches(path)).map(([, messages]) => messages));
}
