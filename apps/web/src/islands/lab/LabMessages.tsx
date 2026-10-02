import { useState } from 'react';
import type { I18nRef } from '@cryventure/core';
import { useT } from '@cryventure/viz';

/** Shown when the URL carried lab state that could not be used; dismissible. */
export function InvalidLinkNotice() {
  const t = useT();
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div className="cv-lab-notice" role="status">
      <span>{t('ui.lab.notice.invalidLink')}</span>
      <button type="button" className="cv-button" onClick={() => setVisible(false)}>
        {t('ui.lab.notice.dismiss')}
      </button>
    </div>
  );
}

export interface LabErrorProps {
  error: I18nRef;
  onReset: () => void;
}

/** Lab-level failure (crash, unknown producer, failed load) with a "reset lab" action. */
export function LabError({ error, onReset }: LabErrorProps) {
  const t = useT();
  return (
    <div className="cv-lab-error" role="alert">
      <p>{t(error)}</p>
      <button type="button" className="cv-button" onClick={onReset}>
        {t('ui.lab.reset')}
      </button>
    </div>
  );
}
