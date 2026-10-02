import { useEffect, useRef, useState } from 'react';
import { useT } from '@cryventure/viz';
import { resetProgress } from '../../progress/index.ts';

type ResetStep = 'idle' | 'confirming' | 'done';

/** Reset with an in-page confirmation step; focus moves into the confirmation and back. */
export function ResetProgress() {
  const t = useT();
  const [step, setStep] = useState<ResetStep>('idle');
  const confirmRef = useRef<HTMLButtonElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  const previousStep = useRef<ResetStep>(step);

  useEffect(() => {
    if (step === 'confirming') confirmRef.current?.focus();
    else if (previousStep.current === 'confirming') resetRef.current?.focus();
    previousStep.current = step;
  }, [step]);

  const confirm = (): void => {
    resetProgress();
    setStep('done');
  };

  return (
    <section aria-labelledby="cv-progress-reset">
      <h2 id="cv-progress-reset">{t('quiz.progress.reset.title')}</h2>
      {step === 'confirming' ? (
        <div className="cv-progress__confirm" role="group" aria-labelledby="cv-progress-reset-question">
          <p id="cv-progress-reset-question">{t('quiz.progress.reset.confirm')}</p>
          <div className="cv-progress__row">
            <button ref={confirmRef} type="button" className="cv-quiz__button cv-quiz__button--primary" onClick={confirm}>
              {t('quiz.progress.reset.yes')}
            </button>
            <button type="button" className="cv-quiz__button" onClick={() => setStep('idle')}>
              {t('quiz.progress.reset.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button ref={resetRef} type="button" className="cv-quiz__button" onClick={() => setStep('confirming')}>
          {t('quiz.progress.reset')}
        </button>
      )}
      <p className="cv-progress__status" data-tone={step === 'done' ? 'ok' : undefined} role="status" aria-live="polite">
        {step === 'done' && t('quiz.progress.reset.done')}
      </p>
    </section>
  );
}
