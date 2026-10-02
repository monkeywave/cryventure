import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { lintGermanCatalog, lintGermanMdx } from './de-style.ts';
import { listFiles } from '../fs/walk.ts';
import { checkTranslationFreshness } from './translation-freshness.ts';
import {
  compareCatalogs,
  compareDocTrees,
  flattenCatalog,
  formatIssues,
  hasErrors,
  pairCatalogPaths,
  SOURCE_LOCALE,
  TARGET_LOCALE,
  type ParityIssue,
} from './parity.ts';

/** Where catalogs live, relative to the repo root: plugin/package `i18n/{en,de}.json` and app dictionaries. */
const CATALOG_ROOTS = ['packages', 'apps/web/src'];
const CATALOG_PATTERN = /(^|\/)i18n\/(?:en|de)(?:\.json|\/[^/]+\.json)$/;
export const DOCS_ROOT = 'apps/web/src/content/docs';
const PAGE_PATTERN = /\.mdx?$/;

/** Repo-relative paths of every EN/DE message catalog. */
export function discoverCatalogs(root: string): string[] {
  return CATALOG_ROOTS.flatMap((base) => listFiles(join(root, base), (path) => CATALOG_PATTERN.test(path)).map((path) => `${base}/${path}`));
}

function readCatalog(root: string, path: string): Record<string, unknown> {
  return flattenCatalog(JSON.parse(readFileSync(join(root, path), 'utf8')));
}

function catalogIssues(root: string): ParityIssue[] {
  const { pairs, issues } = pairCatalogPaths(discoverCatalogs(root));
  return [...issues, ...pairs.flatMap((pair) => compareCatalogs(readCatalog(root, pair.en), readCatalog(root, pair.de), pair.en))];
}

function docIssues(root: string): ParityIssue[] {
  const pages = (locale: string) => listFiles(join(root, DOCS_ROOT, locale), (path) => PAGE_PATTERN.test(path));
  return compareDocTrees(pages(SOURCE_LOCALE), pages(TARGET_LOCALE), DOCS_ROOT);
}

/** German style lint (docs/GLOSSARY.md) over every DE catalog and DE page. */
function styleIssues(root: string): ParityIssue[] {
  const deCatalogs = pairCatalogPaths(discoverCatalogs(root)).pairs.map((pair) => pair.de);
  const dePages = listFiles(join(root, DOCS_ROOT, TARGET_LOCALE), (path) => PAGE_PATTERN.test(path)).map((page) => `${DOCS_ROOT}/${TARGET_LOCALE}/${page}`);
  return [
    ...deCatalogs.flatMap((path) => lintGermanCatalog(readCatalog(root, path), path)),
    ...dePages.flatMap((path) => lintGermanMdx(readFileSync(join(root, path), 'utf8'), path)),
  ];
}

/** Every DE page with an EN counterpart must carry the current `sourceHash` of that EN page. */
function freshnessIssues(root: string): ParityIssue[] {
  const enPages = new Set(listFiles(join(root, DOCS_ROOT, SOURCE_LOCALE), (path) => PAGE_PATTERN.test(path)));
  return listFiles(join(root, DOCS_ROOT, TARGET_LOCALE), (path) => PAGE_PATTERN.test(path))
    .filter((page) => enPages.has(page))
    .flatMap((page) =>
      checkTranslationFreshness({
        dePath: `${DOCS_ROOT}/${TARGET_LOCALE}/${page}`,
        deSource: readFileSync(join(root, DOCS_ROOT, TARGET_LOCALE, page), 'utf8'),
        enBytes: readFileSync(join(root, DOCS_ROOT, SOURCE_LOCALE, page)),
      }),
    );
}

export interface ParityReport {
  catalogs: number;
  issues: ParityIssue[];
  exitCode: 0 | 1;
}

/** Runs every parity check against the repo at `root`. Exit code 1 when any error was found. */
export function runParityCheck(root: string = REPO_ROOT): ParityReport {
  const issues = [...catalogIssues(root), ...docIssues(root), ...freshnessIssues(root), ...styleIssues(root)];
  return { catalogs: discoverCatalogs(root).length, issues, exitCode: hasErrors(issues) ? 1 : 0 };
}

/** Human-readable summary lines for the CLI. */
export function reportLines(report: ParityReport): string[] {
  const errors = report.issues.filter((entry) => entry.severity === 'error').length;
  const warnings = report.issues.length - errors;
  return [...formatIssues(report.issues), `i18n parity: ${report.catalogs} catalogs, ${errors} error(s), ${warnings} warning(s)`];
}

function isEntryPoint(): boolean {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntryPoint()) {
  const report = runParityCheck();
  reportLines(report).forEach((line) => console.log(line));
  process.exitCode = report.exitCode;
}
