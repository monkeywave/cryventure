// @vitest-environment jsdom
import '@cryventure/viz/testing/setup';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import en from '../i18n/en/quiz.json' with { type: 'json' };
import de from '../i18n/de/quiz.json' with { type: 'json' };
import { emptyProgress, getProgress, replaceProgress } from '../progress/index.ts';
import QuizQuestion, { type QuizQuestionProps } from './QuizQuestion.tsx';

const LESSON = 'symmetric/aes';

function props(overrides: Partial<QuizQuestionProps> = {}): QuizQuestionProps {
  return { lessonKey: LESSON, questionId: 'aes128-rounds', number: 2, question: 'How many rounds does AES-128 use?', options: ['8', '10', '12', '14'], answer: 1, messages: en, locale: 'en', ...overrides };
}

function renderQuiz(overrides: Partial<QuizQuestionProps> = {}) {
  return render(
    <QuizQuestion {...props(overrides)}>
      <p>Ten rounds for a 128-bit key.</p>
    </QuizQuestion>,
  );
}

const option = (name: RegExp | string) => screen.getByRole<HTMLInputElement>('radio', { name });
const button = (name: string) => screen.getByRole('button', { name });
const feedback = () => screen.getByRole('status');

beforeEach(() => act(() => replaceProgress(emptyProgress())));
afterEach(cleanup);

describe('QuizQuestion', () => {
  it('groups the options under the question in a fieldset', () => {
    renderQuiz();
    const group = screen.getByRole('group', { name: /Question 2: How many rounds/ });
    expect(within(group).getAllByRole('radio')).toHaveLength(4);
    expect(screen.queryByText('Ten rounds for a 128-bit key.')).toBeNull();
  });

  it('asks for a selection before checking', async () => {
    renderQuiz();
    await userEvent.click(button('Check'));
    expect(feedback().textContent).toBe('Pick an answer first.');
    expect(getProgress().lessons[LESSON]).toBeUndefined();
  });

  it('reports a wrong answer, records it and lets the learner retry', async () => {
    renderQuiz();
    await userEvent.click(option(/^C/));
    await userEvent.click(button('Check'));
    expect(feedback().textContent).toContain('Not quite');
    expect(option(/^C.*wrong/).checked).toBe(true);
    expect(getProgress().lessons[LESSON]?.quiz['aes128-rounds']).toEqual({ solved: false, lastAnswer: 2 });
    await userEvent.click(button('Try again'));
    expect(screen.getAllByRole('radio').some((radio) => (radio as HTMLInputElement).checked)).toBe(false);
    expect(feedback().textContent).toBe('');
  });

  it('confirms a correct answer, reveals the explanation and records it as solved', async () => {
    renderQuiz();
    await userEvent.click(option(/^C/));
    await userEvent.click(button('Check'));
    await userEvent.click(option(/^B/));
    await userEvent.click(button('Check'));
    expect(feedback().textContent).toContain('Correct!');
    expect(screen.getByText('Answer: B')).toBeTruthy();
    expect(screen.getByText('Ten rounds for a 128-bit key.')).toBeTruthy();
    expect(getProgress().lessons[LESSON]?.quiz['aes128-rounds']).toEqual({ solved: true, lastAnswer: 1 });
  });

  it('shows the answer on request without recording an attempt', async () => {
    renderQuiz();
    await userEvent.click(button('Show answer'));
    expect(screen.getByText('Answer: B')).toBeTruthy();
    expect(option(/^B.*correct/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show answer' })).toBeNull();
    expect(getProgress().lessons[LESSON]).toBeUndefined();
  });

  it('records an answer checked after "Show answer" without marking the question solved', async () => {
    renderQuiz();
    await userEvent.click(button('Show answer'));
    await userEvent.click(option(/^B/));
    await userEvent.click(button('Check'));
    expect(getProgress().lessons[LESSON]?.quiz['aes128-rounds']).toEqual({ solved: false, lastAnswer: 1 });
  });

  it('keeps a question solved earlier solved when it is checked again after "Show answer"', async () => {
    act(() => replaceProgress({ version: 2, lessons: { [LESSON]: { quiz: { 'aes128-rounds': { solved: true, lastAnswer: 1 } } } } }));
    renderQuiz();
    await userEvent.click(button('Try again'));
    await userEvent.click(button('Show answer'));
    await userEvent.click(option(/^B/));
    await userEvent.click(button('Check'));
    expect(getProgress().lessons[LESSON]?.quiz['aes128-rounds']).toEqual({ solved: true, lastAnswer: 1 });
  });

  it('works with the keyboard alone', async () => {
    renderQuiz();
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(option(/^A/));
    await user.keyboard('{ArrowDown}');
    expect(option(/^B/).checked).toBe(true);
    await user.keyboard('{Enter}');
    expect(feedback().textContent).toContain('Correct!');
  });

  it('restores an earlier answer from progress', () => {
    act(() => replaceProgress({ version: 2, lessons: { [LESSON]: { quiz: { 'aes128-rounds': { solved: true, lastAnswer: 1 } } } } }));
    renderQuiz();
    expect(option(/^B/).checked).toBe(true);
    expect(feedback().textContent).toContain('Correct!');
    expect(button('Try again')).toBeTruthy();
  });

  it('shows a tampered entry as wrong when its last answer is wrong', () => {
    act(() => replaceProgress({ version: 2, lessons: { [LESSON]: { quiz: { 'aes128-rounds': { solved: true, lastAnswer: 3 } } } } }));
    renderQuiz();
    expect(feedback().textContent).toContain('Not quite');
  });

  it('treats an out-of-range stored answer as unanswered', () => {
    act(() => replaceProgress({ version: 2, lessons: { [LESSON]: { quiz: { 'aes128-rounds': { solved: true, lastAnswer: 9 } } } } }));
    renderQuiz();
    expect(screen.getAllByRole('radio').some((radio) => (radio as HTMLInputElement).checked)).toBe(false);
    expect(button('Check')).toBeTruthy();
  });

  it('keeps other questions and lessons apart', async () => {
    renderQuiz({ lessonKey: 'other/lesson', questionId: 'other-question', number: 1 });
    await userEvent.click(option(/^B/));
    await userEvent.click(button('Check'));
    expect(Object.keys(getProgress().lessons)).toEqual(['other/lesson']);
    expect(getProgress().lessons['other/lesson']?.quiz).toEqual({ 'other-question': { solved: true, lastAnswer: 1 } });
  });

  it('exposes the question id on the form', () => {
    const { container } = renderQuiz();
    expect(container.querySelector('form')?.dataset.questionId).toBe('aes128-rounds');
  });

  it('renders German', async () => {
    renderQuiz({ messages: de, locale: 'de' });
    expect(screen.getByRole('group', { name: /^Frage 2:/ })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(feedback().textContent).toBe('Wähle zuerst eine Antwort.');
  });
});

describe('QuizQuestion without JavaScript (server render)', () => {
  it('shows question, options and a <details> answer with the explanation', () => {
    const html = renderToString(
      <QuizQuestion {...props()}>
        <p>Ten rounds for a 128-bit key.</p>
      </QuizQuestion>,
    );
    document.body.innerHTML = html;
    expect(document.querySelectorAll('input[type="radio"]')).toHaveLength(4);
    const details = document.querySelector('details');
    expect(details?.querySelector('summary')?.textContent).toBe('Show answer');
    expect(details?.textContent).toContain('Answer: B');
    expect(details?.textContent).toContain('Ten rounds for a 128-bit key.');
    expect(document.querySelector('button')).toBeNull();
    document.body.innerHTML = '';
  });
});
