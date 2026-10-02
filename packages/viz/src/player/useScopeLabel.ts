import type { AnyStateFacet } from '@cryventure/core';
import { useT } from '../i18n/I18nProvider.tsx';
import { useLab } from '../lab/LabContext.tsx';
import { useFacet } from '../lab/useFacet.ts';
import { compactOpLabel, useOpLabels } from './opLabel.ts';
import { opAt } from '../lab/stateSteps.ts';
import { formatScopePath, scopeAt, scopeLevelKeys } from './scopeLabel.ts';

/** Translated scope path of the current step, e.g. "Round 3 · SubBytes" (empty at the initial state). */
export function useScopeLabel(): string {
  const t = useT();
  const step = useLab((state) => state.step);
  const opLabels = useOpLabels();
  const facet = useFacet<AnyStateFacet>('state');
  const op = opAt(facet.data?.steps ?? [], step);
  const deepestLabel = op === undefined ? undefined : compactOpLabel(t, opLabels, op);
  return formatScopePath(scopeAt(facet.data, step), t, scopeLevelKeys(facet.data), deepestLabel);
}
