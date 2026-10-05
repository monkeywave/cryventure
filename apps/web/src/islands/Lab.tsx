import { useMemo, type ComponentType, type ReactNode } from 'react';
import { i18nRef, type I18nRef, type Lens, type Messages } from '@cryventure/core';
import { ErrorBoundary, I18nProvider, LabRoot, Workspace, useT, type LabMode, type ParamsRequestHandler } from '@cryventure/viz';
import type { LabParams, ReadySession } from '../labs/labSession.ts';
import { useLabLens } from '../progress/useLabLens.ts';
import { ComputingStatus } from './lab/ComputingStatus.tsx';
import { InvalidLinkNotice, LabError } from './lab/LabMessages.tsx';
import { viewsToShow, type LabViewsOption } from './lab/labViews.ts';
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
  /** Workspace panel preset, e.g. `"state|narration"`, with renamed view ids already resolved (`components/labIsland.ts`). */
  layout?: string;
  /** Pins the lab to one lens; without it the lab follows the page lens (header selector) live. */
  lens?: Lens;
  /** Start position when the deep link has none: `"round:1,op:subBytes"` or `"step:12"` (see `labs/startAt.ts`). */
  startAt?: string;
  /** Preselected player mode (default: debugger). Never starts playback on its own. */
  mode?: LabMode;
  /** Initial lab-wide preferred facet variant, e.g. `x86_64-aesni`; the reader's pick overrides it. */
  variant?: string;
  /** Only the namespaces this lab needs, in the page's locale (assembled by `components/labIsland.ts`). */
  messages: Messages;
  /** Page locale (e.g. `de`), used for plural forms and links to standalone labs. */
  locale?: string;
  /** Static poster rendered on the server and shown until the lab is ready. */
  children?: ReactNode;
  /**
   * Extra controls rendered inside the lab (above the inputs) once it is ready, e.g. the home hero's
   * text field (`hero/HeroLab.tsx`). They may use `useLabActions().requestParams` to re-run the lab.
   */
  toolbar?: ComponentType<LabToolbarProps>;
  /** `"all"` (default): every view the bundle can feed; `"layout-only"`: only the views `layout` names (set by `hero/HeroLab.tsx`). */
  views?: LabViewsOption;
  /** Shows the generic inputs panel (default `true`); `hero/HeroLab.tsx` hides it so its text field is the only input. */
  paramPanel?: boolean;
}

/** What a `toolbar` sees: the params of the latest requested run. */
export interface LabToolbarProps {
  params: LabParams;
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
  /** Whether the latest re-run is still pending (`ComputingStatus`). */
  computing: boolean;
  toolbar?: ComponentType<LabToolbarProps>;
  views?: LabViewsOption;
  paramPanel: boolean;
}

function ReadyLab({ labId, layout, lens, session, params, onParams, onRequestParams, requestError, computing, toolbar: Toolbar, views: viewsOption, paramPanel }: ReadyLabProps) {
  const t = useT();
  const views = useMemo(() => viewsToShow(session.views, layout, viewsOption), [session.views, layout, viewsOption]);
  useHashSync(labId, session.store, session.params, { clearLink: session.notice });
  return (
    <LabRoot store={session.store} choreography={session.choreography} opLabels={session.producer.ops} onRequestParams={onRequestParams} derivers={session.derivers}>
      <p className="cv-lab__title">{t(session.producer.titleKey)}</p>
      {session.notice && <InvalidLinkNotice />}
      {Toolbar && <Toolbar params={params} />}
      {paramPanel && <ParamPanel producer={session.producer} params={params} onApply={onParams} requestError={requestError} />}
      <ComputingStatus computing={computing} />
      <PlayerBar />
      <Workspace views={views} layout={layout} labId={labId} lens={lens} />
      <OutputPanel producer={session.producer} />
    </LabRoot>
  );
}

function LabBody({ labId, producerId, presetId, startAt, mode, variant, locale, layout, lens, toolbar, views, paramPanel = true, children }: Omit<LabProps, 'messages' | 'lens'> & { lens: Lens }) {
  const { session, pendingParams, applyParams, requestParams, requestError, computing, reset } = useLabSession({ labId, producerId, presetId, startAt, mode, variant, locale });
  if (session.status === 'loading') return <>{children}</>;
  if (session.status === 'error') return <LabError error={session.error} onReset={reset} />;
  return (
    <ErrorBoundary fallback={(resetBoundary) => <LabError error={i18nRef('ui.lab.error.crashed')} onReset={() => { reset(); resetBoundary(); }} />}>
      <ReadyLab labId={labId} layout={layout} lens={lens} session={session} params={pendingParams ?? session.params} onParams={applyParams} onRequestParams={requestParams} requestError={requestError} computing={computing} toolbar={toolbar} views={views} paramPanel={paramPanel} />
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
