import { useT } from '../i18n/I18nProvider.tsx';

export type ViewStatusKind = 'loading' | 'missing' | 'empty';

const DEFAULT_KEYS: Readonly<Record<ViewStatusKind, string>> = {
  loading: 'ui.view.loading',
  missing: 'ui.view.missing',
  empty: 'ui.workspace.empty',
};

export interface ViewStatusProps {
  status: ViewStatusKind;
  /** The view's own message keys per status (e.g. `view.state.loading`); viz defaults otherwise. */
  keys?: Partial<Readonly<Record<ViewStatusKind, string>>>;
}

/**
 * The one translated `role="status"` placeholder of views and the workspace (loading, missing
 * facet, nothing to show), e.g. `if (facet.status !== 'ready') return <ViewStatus status={facet.status} keys={KEYS} />`.
 */
export function ViewStatus({ status, keys }: ViewStatusProps) {
  const t = useT();
  return (
    <p className="cv-view__status" role="status" data-status={status}>
      {t(keys?.[status] ?? DEFAULT_KEYS[status])}
    </p>
  );
}
