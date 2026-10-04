import { useCallback, useMemo } from 'react';
import type { ValuesFacet } from '@cryventure/core';
import { useFacet, useT } from '@cryventure/viz';

/** Translated names of ValueRefs from the optional `values` facet (`undefined` when it is absent or lacks the id). */
export function useValueLabel(): (id: string) => string | undefined {
  const t = useT();
  const values = useFacet<ValuesFacet>('values');
  const labelKeys = useMemo(
    () => new Map<string, string>(values.status === 'ready' ? values.data.values.map((value) => [value.id, value.labelKey]) : []),
    [values],
  );
  return useCallback(
    (id: string) => {
      const labelKey = labelKeys.get(id);
      return labelKey === undefined ? undefined : t(labelKey);
    },
    [labelKeys, t],
  );
}
