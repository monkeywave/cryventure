import type { StateFacet, Translate } from '@cryventure/core';
import { useT } from '../i18n/I18nProvider.tsx';
import { useLab } from '../lab/LabContext.tsx';
import { useFacet } from '../lab/useFacet.ts';
import { compactOpLabel } from './opLabel.ts';
import { opAt } from '../lab/stateSteps.ts';
import { formatScopePath, scopeAt, scopeLevelKeys } from './scopeLabel.ts';

function opText(t: Translate, producerId: string | undefined, op: string | undefined): string | undefined {
  return producerId === undefined || op === undefined ? undefined : compactOpLabel(t, producerId, op);
}

/** Translated scope path of the current step, e.g. "Round 3 · SubBytes" (empty at the initial state). */
export function useScopeLabel(): string {
  const t = useT();
  const step = useLab((state) => state.step);
  const producerId = useLab((state) => state.bundle?.producer.id);
  const facet = useFacet<StateFacet<string, { op: string }>>('state');
  const deepestLabel = opText(t, producerId, opAt(facet.data?.steps ?? [], step));
  return formatScopePath(scopeAt(facet.data, step), t, scopeLevelKeys(facet.data), deepestLabel);
}
