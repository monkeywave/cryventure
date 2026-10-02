import type { ReactNode } from 'react';
import { i18nRef, type Lens, type Messages } from '@cryventure/core';
import { ErrorBoundary, I18nProvider, LabRoot, Workspace, useT, type LabMode } from '@cryventure/viz';
import type { LabParams, ReadySession } from '../labs/labSession.ts';
import { InvalidLinkNotice, LabError } from './lab/LabMessages.tsx';
import { OutputPanel } from './lab/OutputPanel.tsx';
import { ParamPanel } from './lab/ParamPanel.tsx';
import { PlayerBar } from './lab/PlayerBar.tsx';
import { useHashSync } from './lab/useHashSync.ts';
import { useLabSession } from './lab/useLabSession.ts';

export interface LabProps {
  /** Unique per page; keys the deep link and saved panel sizes. */
  labId: string;
  producerId: string;
  presetId?: string;
  /** Workspace panel preset, e.g. `"state|narration"`. */
  layout?: string;
  lens?: Lens;
  /** Start position when the deep link has none: `"round:1,op:subBytes"` or `"step:12"` (see `labs/startAt.ts`). */
  startAt?: string;
  /** Preselected player mode (default: debugger). Never starts playback on its own. */
  mode?: LabMode;
  /** Only the namespaces this lab needs, in the page's locale (assembled by `Lab.astro`). */
  messages: Messages;
  /** Page locale (e.g. `de`), used for plural forms. */
  locale?: string;
  /** Static poster rendered on the server and shown until the lab is ready. */
  children?: ReactNode;
}

interface ReadyLabProps {
  labId: string;
  layout?: string;
  lens: Lens;
  session: ReadySession;
  onParams: (params: LabParams) => void;
}

function ReadyLab({ labId, layout, lens, session, onParams }: ReadyLabProps) {
  const t = useT();
  useHashSync(labId, session.store, session.params);
  return (
    <LabRoot store={session.store} choreography={session.choreography} opLabels={session.producer.ops}>
      <p className="cv-lab__title">{t(session.producer.titleKey)}</p>
      {session.notice && <InvalidLinkNotice />}
      <ParamPanel producer={session.producer} params={session.params} onApply={onParams} />
      <PlayerBar />
      <Workspace views={session.views} layout={layout} labId={labId} lens={lens} />
      <OutputPanel producer={session.producer} />
    </LabRoot>
  );
}

function LabBody({ labId, producerId, presetId, startAt, mode, layout, lens = 'engineer', children }: Omit<LabProps, 'messages'>) {
  const { session, applyParams, reset } = useLabSession({ labId, producerId, presetId, startAt, mode });
  if (session.status === 'loading') return <>{children}</>;
  if (session.status === 'error') return <LabError error={session.error} onReset={reset} />;
  return (
    <ErrorBoundary fallback={(resetBoundary) => <LabError error={i18nRef('ui.lab.error.crashed')} onReset={() => { reset(); resetBoundary(); }} />}>
      <ReadyLab labId={labId} layout={layout} lens={lens} session={session} onParams={applyParams} />
    </ErrorBoundary>
  );
}

/**
 * Generic lab island: producer manifest → params (hash / preset / defaults) → lazy `run()` →
 * lab store → player + workspace of every view the producer's facets can feed.
 */
export default function Lab({ messages, locale, ...props }: LabProps) {
  return (
    <I18nProvider messages={messages} locale={locale}>
      <div className="cv-lab-island" data-lab-id={props.labId}>
        <LabBody {...props} />
      </div>
    </I18nProvider>
  );
}
