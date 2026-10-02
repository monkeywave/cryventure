import { useId, type ReactNode, type SubmitEvent } from 'react';
import type { Messages } from '@cryventure/core';
import { I18nProvider, useT } from '@cryventure/viz';
import { optionLetter } from '../quiz/quizModel.ts';
import { QuizFeedback, QuizOption } from './quiz/QuizParts.tsx';
import { useHydrated } from './quiz/useHydrated.ts';
import { useQuizQuestion, type QuizQuestionState } from './quiz/useQuizQuestion.ts';

export interface QuizQuestionProps {
  /** Lesson the question belongs to (see `lessonKeyFromPath`). */
  lessonKey: string;
  number: number;
  question: string;
  options: string[];
  /** Zero-based index of the correct option. */
  answer: number;
  /** The `quiz.question.*` messages of the page locale (assembled by `CheckQuestion.astro`). */
  messages: Messages;
  locale?: string;
  /** Explanation, rendered on the server (the component's slot). */
  children?: ReactNode;
}

type QuestionBodyProps = Omit<QuizQuestionProps, 'messages' | 'locale'>;

function AnswerExplanation({ answer, children }: Pick<QuestionBodyProps, 'answer' | 'children'>) {
  const t = useT();
  return (
    <>
      <p>
        <strong>{t('quiz.question.answer', { option: optionLetter(answer) })}</strong>
      </p>
      {children}
    </>
  );
}

function QuizActions({ quiz }: { quiz: QuizQuestionState }) {
  const t = useT();
  const answering = quiz.status === 'unanswered';
  return (
    <div className="cv-quiz__actions">
      {answering ? (
        <button type="submit" className="cv-quiz__button cv-quiz__button--primary">
          {t('quiz.question.check')}
        </button>
      ) : (
        <button type="button" className="cv-quiz__button" onClick={quiz.retry}>
          {t('quiz.question.retry')}
        </button>
      )}
      {!quiz.explained && (
        <button type="button" className="cv-quiz__button" onClick={quiz.reveal}>
          {t('quiz.question.showAnswer')}
        </button>
      )}
    </div>
  );
}

function QuestionBody({ lessonKey, number, question, options, answer, children }: QuestionBodyProps) {
  const t = useT();
  const name = useId();
  const hydrated = useHydrated();
  const quiz = useQuizQuestion(lessonKey, number, answer, options.length);
  const onSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    quiz.check();
  };
  return (
    <form className="cv-check cv-quiz" data-status={quiz.status} data-hydrated={hydrated} onSubmit={onSubmit} noValidate>
      <fieldset className="cv-quiz__fieldset">
        <legend className="cv-quiz__question">
          <strong>{t('quiz.question.label', { number })}:</strong> {question}
        </legend>
        {options.map((option, index) => (
          <QuizOption key={index} name={name} index={index} label={option} quiz={quiz} answer={answer} />
        ))}
      </fieldset>
      {hydrated ? (
        <>
          <QuizActions quiz={quiz} />
          <QuizFeedback quiz={quiz} />
          {quiz.explained && (
            <div className="cv-quiz__explanation">
              <AnswerExplanation answer={answer}>{children}</AnswerExplanation>
            </div>
          )}
        </>
      ) : (
        <details className="cv-check__answer">
          <summary>{t('quiz.question.showAnswer')}</summary>
          <AnswerExplanation answer={answer}>{children}</AnswerExplanation>
        </details>
      )}
    </form>
  );
}

/**
 * Interactive check question (docs/M2.md §5). Without JavaScript it stays a readable question with
 * a `<details>` answer; once hydrated it checks the answer and records it in progress.
 */
export default function QuizQuestion({ messages, locale, ...props }: QuizQuestionProps) {
  return (
    <I18nProvider messages={messages} locale={locale}>
      <QuestionBody {...props} />
    </I18nProvider>
  );
}
