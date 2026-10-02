import { useId, useState, type ChangeEvent } from 'react';
import { useT } from '@cryventure/viz';
import { exportProgress, getProgress, importProgress, replaceProgress } from '../../progress/index.ts';
import { downloadText } from './downloadText.ts';

export const EXPORT_FILE_NAME = 'cryventure-progress.json';

type TransferStatus = { tone: 'ok' | 'error'; key: string } | undefined;

async function importFile(file: File): Promise<TransferStatus> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { tone: 'error', key: 'quiz.progress.import.error.unreadable' };
  }
  const result = importProgress(text);
  if (!result.ok) return { tone: 'error', key: `quiz.progress.import.error.${result.error}` };
  replaceProgress(result.progress);
  return { tone: 'ok', key: 'quiz.progress.import.done' };
}

/** Export to a JSON download and import from a chosen file; import errors are shown translated. */
export function ProgressTransfer() {
  const t = useT();
  const inputId = useId();
  const [status, setStatus] = useState<TransferStatus>(undefined);

  const onFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file === undefined) return;
    setStatus(await importFile(file));
    input.value = '';
  };

  return (
    <section aria-labelledby="cv-progress-transfer">
      <h2 id="cv-progress-transfer">{t('quiz.progress.transfer.title')}</h2>
      <div className="cv-progress__row">
        <button type="button" className="cv-quiz__button" onClick={() => downloadText(EXPORT_FILE_NAME, exportProgress(getProgress()))}>
          {t('quiz.progress.export')}
        </button>
        <input id={inputId} className="cv-progress__file" type="file" accept="application/json,.json" onChange={(event) => void onFile(event)} />
        <label htmlFor={inputId} className="cv-quiz__button">
          {t('quiz.progress.import')}
        </label>
      </div>
      <p className="cv-progress__status" data-tone={status?.tone} role="status" aria-live="polite">
        {status && t(status.key)}
      </p>
    </section>
  );
}
