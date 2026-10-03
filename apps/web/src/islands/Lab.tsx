import type { ReactNode } from 'react';
import { i18nRef, type I18nRef, type Lens, type Messages } from '@cryventure/core';
import { ErrorBoundary, I18nProvider, LabRoot, Workspace, useT, type LabMode, type ParamsRequestHandler } from '@cryventure/viz';
import type { LabParams, ReadySession } from '../labs/labSession.ts';
import { useLabLens } from '../progress/useLabLens.ts';
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
  /** Pins the lab to one lens; without it the lab follows the page lens (header selector) live. */
  lens?: Lens;
  /** Start position when the deep link has none: `"round:1,op:subBytes"` or `"step:12"` (see `labs/startAt.ts`). */
  startAt?: string;
  /** Preselected player mode (default: debugger). Never starts playback on its own. */
  mode?: LabMode;
  /** Only the namespaces this lab needs, in the page's locale (assembled by `Lab.astro`). */
  messages: Messages;
  /** Page locale (e.g. `de`), used for plural forms and links to standalone labs. */
  locale?: string;
  /** Static poster rendered on the server and shown until the lab is ready. */
  children?: ReactNode;
}

interface ReadyLabProps {
  labId: string;
  layout?: string;
  lens: Lens;
  session: ReadySession;
  /** The params of the latest requested run (`useLabSession().pendingParams`), shown in the ParamPanel. */
  params: LabParams;
  onParams: (params: LabParams) => void;
  /** A view's re-run request (`useLabActions().requestParams`). */
  onRequestParams: ParamsRequestHandler;
  /** Why the last view request was rejected, shown in the ParamPanel. */
  requestError: I18nRef | null;
}

function ReadyLab({ labId, layout, lens, session, params, onParams, onRequestParams, requestError }: ReadyLabProps) {
  const t = useT();
  useHashSync(labId, session.store, session.params);
  return (
    <LabRoot store={session.store} choreography={session.choreography} opLabels={session.producer.ops} onRequestParams={onRequestParams}>
      <p className="cv-lab__title">{t(session.producer.titleKey)}</p>
      {session.notice && <InvalidLinkNotice />}
      <ParamPanel producer={session.producer} params={params} onApply={onParams} requestError={requestError} />
      <PlayerBar />
      <Workspace views={session.views} layout={layout} labId={labId} lens={lens} />
      <OutputPanel producer={session.producer} />
    </LabRoot>
  );
}

function LabBody({ labId, producerId, presetId, startAt, mode, locale, layout, lens, children }: Omit<LabProps, 'messages' | 'lens'> & { lens: Lens }) {
  const { session, pendingParams, applyParams, requestParams, requestError, reset } = useLabSession({ labId, producerId, presetId, startAt, mode, locale });
  if (session.status === 'loading') return <>{children}</>;
  if (session.status === 'error') return <LabError error={session.error} onReset={reset} />;
  return (
    <ErrorBoundary fallback={(resetBoundary) => <LabError error={i18nRef('ui.lab.error.crashed')} onReset={() => { reset(); resetBoundary(); }} />}>
      <ReadyLab labId={labId} layout={layout} lens={lens} session={session} params={pendingParams ?? session.params} onParams={applyParams} onRequestParams={requestParams} requestError={requestError} />
    </ErrorBoundary>
  );
}

/**
 * Generic lab island: producer manifest → params (hash / preset / defaults) → lazy `run()` →
 * lab store → player + workspace of every view the producer's facets can feed.
 */
export default function Lab({ messages, lens: pinnedLens, ...props }: LabProps) {
  const lens = useLabLens(pinnedLens);
  return (
    <I18nProvider messages={messages} locale={props.locale}>
      <div className="cv-lab-island" data-lab-id={props.labId} data-lens={lens}>
        <LabBody {...props} lens={lens} />
      </div>
    </I18nProvider>
  );
}
