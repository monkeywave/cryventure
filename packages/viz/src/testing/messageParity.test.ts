import { describe, expect, it } from 'vitest';
import { messageParityProblems } from './messageParity.ts';

describe('messageParityProblems', () => {
  it('accepts catalogs in sync', () => {
    expect(messageParityProblems({ a: 'Hi {{x}}' }, { a: 'Hallo {{x}}' })).toEqual([]);
  });

  it('reports missing keys both ways, param mismatches and empty values', () => {
    const problems = messageParityProblems({ a: 'A', b: 'B {{n}}', c: '' }, { b: 'B', c: 'C', d: 'D' });
    expect(problems).toEqual([
      'a: missing in de',
      'b: {{params}} differ',
      'd: missing in en',
      'c: empty in en',
    ]);
  });
});
