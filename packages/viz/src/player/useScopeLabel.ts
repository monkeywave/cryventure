import type { StateFacet } from '@cryventure/core';
import { useT } from '../i18n/I18nProvider.tsx';
import { useLab } from '../lab/LabContext.tsx';
import { useFacet } from '../lab/useFacet.ts';
import { formatScopePath, scopeAt } from './scopeLabel.ts';

/** Translated scope path of the current step, e.g. "Round 3 · op 2" (empty at the initial state). */
export function useScopeLabel(): string {
  const t = useT();
  const step = useLab((state) => state.step);
  const facet = useFacet<StateFacet<string, { op: string }>>('state');
  return formatScopePath(scopeAt(facet.data, step), t);
}
