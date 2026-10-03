import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractCheckQuestions } from './checkQuestionSource.ts';

describe('extractCheckQuestions', () => {
  it('lists id and number of every CheckQuestion element in order, ignoring imports', () => {
    const source = [
      "import CheckQuestion from '../../components/lesson/CheckQuestion.astro';",
      '<CheckQuestion id="aes192-rounds" number={1} question="How many?" options={[\'10\', \'12\']} answer={1}>',
      '  `Nr = Nk + 6`',
      '</CheckQuestion>',
      '<CheckQuestion',
      '  number={ 2 }',
      "  id='final-round-omits'",
      '  question="Which > step is omitted?"',
      "  options={['a } b', \"c\"]}",
      '  answer={0}',
      '/>',
    ].join('\n');
    expect(extractCheckQuestions(source, 'x.mdx')).toEqual([
      { id: 'aes192-rounds', number: 1 },
      { id: 'final-round-omits', number: 2 },
    ]);
  });

  it('reads attributes only at the top level of the tag, not inside values', () => {
    const source = '<CheckQuestion question=\'say id="fake-id" number={9}\' id="real-id" number={3} answer={0} />';
    expect(extractCheckQuestions(source, 'x.mdx')).toEqual([{ id: 'real-id', number: 3 }]);
  });

  it('is empty without questions or source', () => {
    expect(extractCheckQuestions('# Title\n\nNo quiz.', 'x.mdx')).toEqual([]);
    expect(extractCheckQuestions(undefined, 'x.mdx')).toEqual([]);
  });

  it('fails for a question without id, naming the source and number', () => {
    expect(() => extractCheckQuestions('<CheckQuestion number={2} answer={0} />', 'en/a.mdx')).toThrow(/en\/a\.mdx.*question 2.*missing.*id/i);
  });

  it.each(['Rcon10', 'rcon_10', '10-rcon', 'rcon--10', ''])('fails for the non-kebab id %j', (id) => {
    expect(() => extractCheckQuestions(`<CheckQuestion id="${id}" number={1} />`, 'en/a.mdx')).toThrow(/en\/a\.mdx.*kebab-case/);
  });

  it('fails for an id given as an expression', () => {
    expect(() => extractCheckQuestions('<CheckQuestion id={name} number={1} />', 'en/a.mdx')).toThrow(/kebab-case/);
  });

  it('fails for a question without a numeric number', () => {
    expect(() => extractCheckQuestions('<CheckQuestion id="a" number="1" />', 'en/a.mdx')).toThrow(/en\/a\.mdx.*"a".*number/);
  });

  it('fails for duplicate ids in one lesson', () => {
    const source = '<CheckQuestion id="rcon-10" number={1} />\n<CheckQuestion id="rcon-10" number={2} />';
    expect(() => extractCheckQuestions(source, 'en/a.mdx')).toThrow('en/a.mdx: duplicate CheckQuestion id "rcon-10" (questions 1 and 2); ids must be unique per lesson');
  });

  it('fails for an unterminated tag', () => {
    expect(() => extractCheckQuestions('<CheckQuestion id="a" number={1}', 'en/a.mdx')).toThrow(/en\/a\.mdx.*unterminated/);
  });
});

describe('check questions in the lesson sources', () => {
  const docsRoot = fileURLToPath(new URL('../content/docs/', import.meta.url));
  const mdxFiles = (locale: string): string[] =>
    readdirSync(join(docsRoot, locale), { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.mdx'))
      .sort();
  const questionsOf = (locale: string, file: string) => extractCheckQuestions(readFileSync(join(docsRoot, locale, file), 'utf8'), relative(docsRoot, join(docsRoot, locale, file)));

  it('all have valid, per-lesson unique ids', () => {
    const total = ['en', 'de'].flatMap((locale) => mdxFiles(locale).flatMap((file) => questionsOf(locale, file)));
    expect(total.length).toBeGreaterThan(0);
  });

  it('use the same ids, with the same numbers, in EN and DE', () => {
    for (const file of mdxFiles('en')) {
      const en = questionsOf('en', file);
      if (en.length === 0) continue;
      expect(questionsOf('de', file), file).toEqual(en);
    }
  });
});
