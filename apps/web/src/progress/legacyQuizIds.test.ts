import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractCheckQuestions } from '../quiz/checkQuestionSource.ts';
import { lessonKeyFromPath } from './lessonKey.ts';
import { LEGACY_QUIZ_IDS } from './migrations.ts';

const DOCS = join(import.meta.dirname, '../content/docs');

function mdxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return mdxFiles(path);
    return entry.name.endsWith('.mdx') ? [path] : [];
  });
}

/** Lesson key → question ids, per locale, from the current MDX sources. */
function currentIdsByLocale(): Map<string, Map<string, Set<string>>> {
  const byLocale = new Map<string, Map<string, Set<string>>>();
  for (const file of mdxFiles(DOCS)) {
    const [locale = '', ...rest] = relative(DOCS, file).split('/');
    const key = lessonKeyFromPath(`/${rest.join('/').replace(/(\/index)?\.mdx$/, '')}/`, '/');
    const ids = new Set(extractCheckQuestions(readFileSync(file, 'utf8'), file).map((question) => question.id));
    if (!byLocale.has(locale)) byLocale.set(locale, new Map());
    byLocale.get(locale)?.set(key, ids);
  }
  return byLocale;
}

describe('LEGACY_QUIZ_IDS (frozen v1 number → id map)', () => {
  const byLocale = currentIdsByLocale();

  it('covers the v1 lessons', () => {
    expect(Object.keys(LEGACY_QUIZ_IDS).length).toBeGreaterThan(0);
    expect(byLocale.size).toBeGreaterThan(1);
  });

  it.each(Object.entries(LEGACY_QUIZ_IDS))('%s: every id still exists in the current MDX of every locale', (lessonKey, numbers) => {
    for (const [locale, lessons] of byLocale) {
      const ids = lessons.get(lessonKey);
      expect(ids, `${locale}/${lessonKey}`).toBeDefined();
      for (const id of Object.values(numbers)) expect(ids?.has(id), `${locale}/${lessonKey}: ${id}`).toBe(true);
    }
  });

  it('keys each lesson by v1 question numbers', () => {
    for (const numbers of Object.values(LEGACY_QUIZ_IDS)) for (const key of Object.keys(numbers)) expect(key).toMatch(/^[1-9]\d*$/);
  });
});
