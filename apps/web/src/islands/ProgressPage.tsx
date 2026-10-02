import type { Messages } from '@cryventure/core';
import { I18nProvider } from '@cryventure/viz';
import type { QuizLesson } from '../quiz/quizModel.ts';
import { LessonResults } from './progress/LessonResults.tsx';
import { ProgressTransfer } from './progress/ProgressTransfer.tsx';
import { ResetProgress } from './progress/ResetProgress.tsx';

export interface ProgressPageProps {
  /** Lessons with check questions in the page locale, in reading order (built from the docs collection). */
  lessons: QuizLesson[];
  /** The `quiz.progress.*` messages of the page locale. */
  messages: Messages;
  locale?: string;
}

/** Progress page island: per-lesson quiz scores, export/import and reset (docs/M2.md §5). */
export default function ProgressPage({ lessons, messages, locale }: ProgressPageProps) {
  return (
    <I18nProvider messages={messages} locale={locale}>
      <div className="cv-progress">
        <LessonResults lessons={lessons} />
        <ProgressTransfer />
        <ResetProgress />
      </div>
    </I18nProvider>
  );
}
