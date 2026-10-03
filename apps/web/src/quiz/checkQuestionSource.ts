import { isQuestionId, type QuizQuestionRef } from '../progress/index.ts';

/**
 * Reads the `{ id, number }` of every `<CheckQuestion>` straight from an MDX source, so the progress
 * page knows each lesson's questions at build time (docs/M3.md §0b). Invalid or duplicate ids throw,
 * which fails the build with the lesson named in the message.
 */

const TAG_START = /<CheckQuestion(?=[\s/>])/g;
const QUOTES = new Set(['"', "'", '`']);

interface Attribute {
  name: string;
  /** Raw value including its delimiters (`"…"`, `'…'` or `{…}`), or `undefined` for a bare attribute. */
  value: string | undefined;
}

/** Index just past the quoted string starting at `start`. */
function skipString(source: string, start: number): number {
  const end = source.indexOf(source[start] as string, start + 1);
  return end === -1 ? source.length : end + 1;
}

/** Index just past the `{…}` expression starting at `start`, skipping strings inside it. */
function skipExpression(source: string, start: number): number {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index] as string;
    if (QUOTES.has(char)) index = skipString(source, index) - 1;
    else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return index + 1;
  }
  return source.length;
}

/** The top-level attributes of the tag whose attributes start at `start`, or `undefined` if it never closes. */
function readAttributes(source: string, start: number): Attribute[] | undefined {
  const attributes: Attribute[] = [];
  const name = /[A-Za-z_:][\w:.-]*/y;
  let index = start;
  while (index < source.length) {
    const char = source[index] as string;
    if (char === '>') return attributes;
    if (/[\s/]/.test(char)) {
      index += 1;
      continue;
    }
    name.lastIndex = index;
    const match = name.exec(source);
    if (match === null) return undefined;
    index = name.lastIndex;
    if (source[index] !== '=') {
      attributes.push({ name: match[0], value: undefined });
      continue;
    }
    const valueStart = index + 1;
    index = source[valueStart] === '{' ? skipExpression(source, valueStart) : skipString(source, valueStart);
    attributes.push({ name: match[0], value: source.slice(valueStart, index) });
  }
  return undefined;
}

function stringValue(value: string | undefined): string | undefined {
  return value !== undefined && /^(["']).*\1$/s.test(value) ? value.slice(1, -1) : undefined;
}

function numberValue(value: string | undefined): number | undefined {
  const match = value?.match(/^\{\s*(\d+)\s*\}$/);
  return match ? Number(match[1]) : undefined;
}

function questionAt(source: string, start: number, sourceName: string): QuizQuestionRef {
  const attributes = readAttributes(source, start);
  if (attributes === undefined) throw new Error(`${sourceName}: unterminated <CheckQuestion> tag`);
  const valueOf = (name: string) => attributes.find((attribute) => attribute.name === name)?.value;
  const rawId = valueOf('id');
  const id = stringValue(rawId);
  const number = numberValue(valueOf('number'));
  const label = number === undefined ? 'a question' : `question ${number}`;
  if (rawId === undefined) throw new Error(`${sourceName}: ${label} is missing its required id (e.g. id="ecb-penguin")`);
  if (!isQuestionId(id)) throw new Error(`${sourceName}: ${label} has the id ${rawId}; ids must be kebab-case string literals starting with a letter`);
  if (number === undefined) throw new Error(`${sourceName}: question "${id}" needs a numeric number={…}`);
  return { id, number };
}

function assertUniqueIds(questions: readonly QuizQuestionRef[], sourceName: string): void {
  const seen = new Map<string, number>();
  for (const { id, number } of questions) {
    const earlier = seen.get(id);
    if (earlier !== undefined) throw new Error(`${sourceName}: duplicate CheckQuestion id "${id}" (questions ${earlier} and ${number}); ids must be unique per lesson`);
    seen.set(id, number);
  }
}

/** The check questions of a lesson in source order; throws on a missing, non-kebab or duplicate id. */
export function extractCheckQuestions(mdxSource: string | undefined, sourceName: string): QuizQuestionRef[] {
  if (mdxSource === undefined) return [];
  const questions = [...mdxSource.matchAll(TAG_START)].map((match) => questionAt(mdxSource, match.index + match[0].length, sourceName));
  assertUniqueIds(questions, sourceName);
  return questions;
}
