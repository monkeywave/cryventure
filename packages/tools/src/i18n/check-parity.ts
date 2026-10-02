import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { supportedLocales } from '@cryventure/core';
import { isEntryPoint } from '../fs/entryPoint.ts';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { listFiles } from '../fs/walk.ts';
import { readCatalogFile } from './catalogFile.ts';
import { lintGermanCatalog, lintGermanMdx } from './de-style.ts';
import { checkTranslationFreshness } from './translation-freshness.ts';
import {
  compareCatalogs,
  compareDocTrees,
  formatIssues,
  hasErrors,
  pairCatalogPaths,
  SOURCE_LOCALE,
  TARGET_LOCALE,
  type CatalogPairs,
  type FlatCatalog,
  type ParityIssue,
} from './parity.ts';

/** Where catalogs live, relative to the repo root: plugin/package `i18n/<locale>.json` and app dictionaries. */
const CATALOG_ROOTS = ['packages', 'apps/web/src'];
const CATALOG_PATTERN = new RegExp(`(^|/)i18n/(?:${supportedLocales.join('|')})(?:\\.json|/[^/]+\\.json)$`);
export const DOCS_ROOT = 'apps/web/src/content/docs';
const PAGE_PATTERN = /\.mdx?$/;

/** Repo-relative paths of every file under the catalog roots (which also contain `DOCS_ROOT`), walked once. */
function listRepoFiles(root: string): string[] {
  return CATALOG_ROOTS.flatMap((base) => listFiles(join(root, base)).map((path) => `${base}/${path}`));
}

function catalogsIn(files: readonly string[]): string[] {
  return files.filter((path) => CATALOG_PATTERN.test(path));
}

/** Doc pages of one locale, relative to `DOCS_ROOT/<locale>`. */
function pagesIn(files: readonly string[], locale: string): string[] {
  const prefix = `${DOCS_ROOT}/${locale}/`;
  return files.filter((path) => path.startsWith(prefix) && PAGE_PATTERN.test(path)).map((path) => path.slice(prefix.length));
}

/** Repo-relative paths of every EN/DE message catalog. */
export function discoverCatalogs(root: string): string[] {
  return catalogsIn(listRepoFiles(root));
}

/** Everything the checks need, discovered once and with every file read once. */
interface ParityInputs {
  catalogPaths: string[];
  catalogPairs: CatalogPairs;
  /** Repo-relative path → flat catalog, for every paired catalog. */
  catalogs: ReadonlyMap<string, FlatCatalog>;
  sourcePages: string[];
  targetPages: string[];
  /** Target-locale page (relative to its locale root) → source text. */
  targetTexts: ReadonlyMap<string, string>;
}

function loadParityInputs(root: string): ParityInputs {
  const files = listRepoFiles(root);
  const catalogPaths = catalogsIn(files);
  const catalogPairs = pairCatalogPaths(catalogPaths);
  const paired = catalogPairs.pairs.flatMap((pair) => [pair.en, pair.de]);
  const catalogs = new Map(paired.map((path) => [path, readCatalogFile(join(root, path))]));
  const targetPages = pagesIn(files, TARGET_LOCALE);
  const targetTexts = new Map(targetPages.map((page) => [page, readFileSync(join(root, DOCS_ROOT, TARGET_LOCALE, page), 'utf8')]));
  return { catalogPaths, catalogPairs, catalogs, sourcePages: pagesIn(files, SOURCE_LOCALE), targetPages, targetTexts };
}

function catalogAt(inputs: ParityInputs, path: string): FlatCatalog {
  return inputs.catalogs.get(path) ?? {};
}

function catalogIssues(inputs: ParityInputs): ParityIssue[] {
  const { pairs, issues } = inputs.catalogPairs;
  return [...issues, ...pairs.flatMap((pair) => compareCatalogs(catalogAt(inputs, pair.en), catalogAt(inputs, pair.de), pair.en))];
}

function docIssues(inputs: ParityInputs): ParityIssue[] {
  return compareDocTrees(inputs.sourcePages, inputs.targetPages, DOCS_ROOT);
}

function targetPagePath(page: string): string {
  return `${DOCS_ROOT}/${TARGET_LOCALE}/${page}`;
}

/** German style lint (docs/GLOSSARY.md) over every DE catalog and DE page. */
function styleIssues(inputs: ParityInputs): ParityIssue[] {
  return [
    ...inputs.catalogPairs.pairs.flatMap((pair) => lintGermanCatalog(catalogAt(inputs, pair.de), pair.de)),
    ...[...inputs.targetTexts].flatMap(([page, text]) => lintGermanMdx(text, targetPagePath(page))),
  ];
}

/** Every DE page with an EN counterpart must carry the current `sourceHash` of that EN page. */
function freshnessIssues(root: string, inputs: ParityInputs): ParityIssue[] {
  const sourcePages = new Set(inputs.sourcePages);
  return [...inputs.targetTexts]
    .filter(([page]) => sourcePages.has(page))
    .flatMap(([page, deSource]) =>
      checkTranslationFreshness({ dePath: targetPagePath(page), deSource, enBytes: readFileSync(join(root, DOCS_ROOT, SOURCE_LOCALE, page)) }),
    );
}

export interface ParityReport {
  catalogs: number;
  issues: ParityIssue[];
  exitCode: 0 | 1;
}

/** Runs every parity check against the repo at `root`. Exit code 1 when any error was found. */
export function runParityCheck(root: string = REPO_ROOT): ParityReport {
  const inputs = loadParityInputs(root);
  const issues = [...catalogIssues(inputs), ...docIssues(inputs), ...freshnessIssues(root, inputs), ...styleIssues(inputs)];
  return { catalogs: inputs.catalogPaths.length, issues, exitCode: hasErrors(issues) ? 1 : 0 };
}

/** Human-readable summary lines for the CLI. */
export function reportLines(report: ParityReport): string[] {
  const errors = report.issues.filter((entry) => entry.severity === 'error').length;
  const warnings = report.issues.length - errors;
  return [...formatIssues(report.issues), `i18n parity: ${report.catalogs} catalogs, ${errors} error(s), ${warnings} warning(s)`];
}

if (isEntryPoint(import.meta.url)) {
  const report = runParityCheck();
  reportLines(report).forEach((line) => console.log(line));
  process.exitCode = report.exitCode;
}
