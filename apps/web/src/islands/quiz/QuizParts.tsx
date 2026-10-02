import { useT } from '@cryventure/viz';
import { optionLetter } from '../../quiz/quizModel.ts';
import type { QuizQuestionState } from './useQuizQuestion.ts';

type OptionMark = 'correct' | 'wrong' | undefined;

/** Marks the checked option (correct or wrong) and, once explained, the correct one. */
function optionMark(index: number, answer: number, quiz: QuizQuestionState): OptionMark {
  const checked = quiz.status !== 'unanswered' && quiz.selected === index;
  if (checked) return quiz.status === 'correct' ? 'correct' : 'wrong';
  return quiz.explained && index === answer ? 'correct' : undefined;
}

const GLYPH = { correct: '✓', wrong: '✗' } as const;

export interface QuizOptionProps {
  name: string;
  index: number;
  label: string;
  answer: number;
  quiz: QuizQuestionState;
}

export function QuizOption({ name, index, label, answer, quiz }: QuizOptionProps) {
  const t = useT();
  const mark = optionMark(index, answer, quiz);
  return (
    <label className="cv-quiz__option" data-mark={mark}>
      <input type="radio" name={name} value={index} checked={quiz.selected === index} onChange={() => quiz.select(index)} />
      <span className="cv-quiz__letter">
        {optionLetter(index)}
      </span>
      <span className="cv-quiz__label">{label}</span>
      {mark && (
        <span className="cv-quiz__mark">
          <span aria-hidden="true">{GLYPH[mark]}</span>
          <span className="sr-only">{t(mark === 'correct' ? 'quiz.question.markCorrect' : 'quiz.question.markWrong')}</span>
        </span>
      )}
    </label>
  );
}

function feedbackKey(quiz: QuizQuestionState): string | undefined {
  if (quiz.needsSelection) return 'quiz.question.pickFirst';
  if (quiz.status === 'correct') return 'quiz.question.correct';
  if (quiz.status === 'wrong') return 'quiz.question.wrong';
  return undefined;
}

/** Live region announcing the result of a check. */
export function QuizFeedback({ quiz }: { quiz: QuizQuestionState }) {
  const t = useT();
  const key = feedbackKey(quiz);
  const tone = quiz.needsSelection ? 'hint' : quiz.status;
  return (
    <p className="cv-quiz__feedback" data-tone={tone} role="status" aria-live="polite">
      {key && (
        <>
          {tone !== 'hint' && <span aria-hidden="true">{GLYPH[quiz.status === 'correct' ? 'correct' : 'wrong']} </span>}
          {t(key)}
        </>
      )}
    </p>
  );
}
