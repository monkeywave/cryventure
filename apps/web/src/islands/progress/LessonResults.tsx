import { useT } from '@cryventure/viz';
import { useProgress, type Progress } from '../../progress/index.ts';
import { lessonScore, lessonsWithProgress, type QuizLesson } from '../../quiz/quizModel.ts';

/** The whole record: a reference held by the store, so `useProgress` stays stable between changes. */
const wholeProgress = (progress: Progress): Progress => progress;

const COMPLETE_GLYPH = '✓ ';

function LessonScoreText({ lesson, progress }: { lesson: QuizLesson; progress: Progress }) {
  const t = useT();
  const score = lessonScore(progress.lessons[lesson.key], lesson.questions);
  if (score.answered === 0) return <span className="cv-progress__score">{t('quiz.progress.lesson.notStarted')}</span>;
  return (
    <span className="cv-progress__score" data-complete={score.correct === score.total}>
      {score.correct === score.total && <span aria-hidden="true">{COMPLETE_GLYPH}</span>}
      {t('quiz.progress.lesson.score', { correct: score.correct, total: score.total })}
    </span>
  );
}

/** Every lesson with check questions and the learner's score in it. */
export function LessonResults({ lessons }: { lessons: readonly QuizLesson[] }) {
  const t = useT();
  const progress = useProgress(wholeProgress);
  const listed = lessonsWithProgress(lessons, progress);
  return (
    <section aria-labelledby="cv-progress-lessons">
      <h2 id="cv-progress-lessons">{t('quiz.progress.lessons.title')}</h2>
      {listed.length === 0 ? (
        <p>{t('quiz.progress.lessons.empty')}</p>
      ) : (
        <ul className="cv-progress__lessons">
          {listed.map((lesson) => (
            <li key={lesson.key} className="cv-progress__lesson" data-lesson-key={lesson.key}>
              {lesson.href ? <a href={lesson.href}>{lesson.title}</a> : <span>{lesson.title}</span>}
              <LessonScoreText lesson={lesson} progress={progress} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
