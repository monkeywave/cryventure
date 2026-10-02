import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runStamp, toRepoPath } from './stamp-source-hash.ts';
import { readSourceHash, sourceHashOf } from './translation-freshness.ts';

const DOCS = 'apps/web/src/content/docs';
const EN_SOURCE = '---\ntitle: Hello\n---\n\n# Hello\n';
let root = '';

function write(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

const read = (path: string) => readFileSync(join(root, path), 'utf8');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cv-stamp-'));
  write(`${DOCS}/en/a.mdx`, EN_SOURCE);
  write(`${DOCS}/de/a.mdx`, '---\ntitle: Hallo\nsourceHash: sha256:00\n---\n\n# Hallo\n');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('toRepoPath', () => {
  it('resolves relative arguments against the cwd and keeps absolute ones', () => {
    expect(toRepoPath('de/a.mdx', root, join(root, DOCS))).toBe(`${DOCS}/de/a.mdx`);
    expect(toRepoPath(join(root, DOCS, 'de/a.mdx'), root, '/elsewhere')).toBe(`${DOCS}/de/a.mdx`);
  });
});

describe('runStamp', () => {
  it('stamps the current EN hash into the DE page', () => {
    const { lines, exitCode } = runStamp([`${DOCS}/de/a.mdx`], root, root);
    expect(exitCode).toBe(0);
    expect(lines).toEqual([`stamped ${DOCS}/de/a.mdx  ${sourceHashOf(EN_SOURCE)}`]);
    expect(readSourceHash(read(`${DOCS}/de/a.mdx`))).toBe(sourceHashOf(EN_SOURCE));
  });

  it('prints usage without arguments', () => {
    expect(runStamp([], root, root)).toEqual({ lines: ['usage: pnpm i18n:stamp <de-page.mdx…>'], exitCode: 1 });
  });

  it('rejects EN pages, missing pages and pages without an EN counterpart, but still stamps the rest', () => {
    write(`${DOCS}/de/only-de.mdx`, '---\ntitle: Nur DE\n---\n');
    const { lines, exitCode } = runStamp([`${DOCS}/en/a.mdx`, `${DOCS}/de/missing.mdx`, `${DOCS}/de/only-de.mdx`, `${DOCS}/de/a.mdx`], root, root);
    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      `error   ${DOCS}/en/a.mdx  not a German page under ${DOCS}/de/`,
      `error   ${DOCS}/de/missing.mdx  ${DOCS}/de/missing.mdx does not exist`,
      `error   ${DOCS}/de/only-de.mdx  no English counterpart ${DOCS}/en/only-de.mdx`,
      `stamped ${DOCS}/de/a.mdx  ${sourceHashOf(EN_SOURCE)}`,
    ]);
    expect(read(`${DOCS}/de/only-de.mdx`)).toBe('---\ntitle: Nur DE\n---\n');
  });

  it('reports a DE page without frontmatter instead of throwing', () => {
    write(`${DOCS}/de/a.mdx`, '# Hallo\n');
    expect(runStamp([`${DOCS}/de/a.mdx`], root, root).lines).toEqual([`error   ${DOCS}/de/a.mdx  ${DOCS}/de/a.mdx: page has no frontmatter`]);
  });
});
