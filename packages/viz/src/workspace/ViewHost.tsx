import { Suspense, lazy, useMemo, useState } from 'react';
import { useT } from '../i18n/I18nProvider.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import type { ReactViewManifest, ViewProps } from './viewTypes.ts';

export interface ViewHostProps extends ViewProps {
  manifest: ReactViewManifest;
}

function ViewLoading() {
  const t = useT();
  return (
    <p className="cv-view__status" role="status">
      {t('ui.view.loading')}
    </p>
  );
}

function ViewError({ titleKey, reset }: { titleKey: string; reset: () => void }) {
  const t = useT();
  return (
    <div className="cv-view__error" role="alert">
      <p>{t('ui.view.error', { view: t(titleKey) })}</p>
      <button type="button" className="cv-button" onClick={reset}>
        {t('ui.view.reset')}
      </button>
    </div>
  );
}

/**
 * Lazy-loads one view via `manifest.load()` behind Suspense and its own error boundary.
 * "Reset" retries from scratch (a new lazy component), so a failed chunk load can recover.
 */
export function ViewHost({ manifest, labId, lens }: ViewHostProps) {
  const [attempt, setAttempt] = useState(0);
  // `attempt` is a deliberate dependency: each reset builds a fresh lazy component (lazy caches rejections).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const View = useMemo(() => lazy(manifest.load), [manifest, attempt]);

  return (
    <div className="cv-view" data-view={manifest.id}>
      <ErrorBoundary onReset={() => setAttempt((n) => n + 1)} fallback={(reset) => <ViewError titleKey={manifest.titleKey} reset={reset} />}>
        <Suspense fallback={<ViewLoading />}>
          {/* Memoised lazy component (stable per manifest/attempt), not recreated on every render. */}
          {/* eslint-disable-next-line react-hooks/static-components */}
          <View labId={labId} lens={lens} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
