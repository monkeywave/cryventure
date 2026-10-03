import { createContext, useContext } from 'react';
import type { OpLabels, Translate } from '@cryventure/core';

/** The producer's op labels keyed by `StateStep.op` (`PrimitiveManifest.ops`). */
export type OpLabelMap = Readonly<Record<string, OpLabels>>;

function labelsOf(opLabels: OpLabelMap | undefined, op: string): OpLabels | undefined {
  return opLabels !== undefined && Object.hasOwn(opLabels, op) ? opLabels[op] : undefined;
}

/** The producer's translated op label, or the raw op name when the producer declares none. */
export function opLabel(t: Translate, opLabels: OpLabelMap | undefined, op: string): string {
  const labels = labelsOf(opLabels, op);
  return labels === undefined ? op : t(labels.labelKey);
}

/**
 * The compact op name (`shortLabelKey`), else the op label, else `undefined` when the producer
 * declares none. `params` (the deepest scope level's, `scopeParams`) fill a short label that names
 * its position, e.g. GHASH's "Bit {{value}}".
 */
export function compactOpLabel(t: Translate, opLabels: OpLabelMap | undefined, op: string, params?: Record<string, number>): string | undefined {
  const labels = labelsOf(opLabels, op);
  return labels === undefined ? undefined : t(labels.shortLabelKey ?? labels.labelKey, params);
}

/** Provided by `LabRoot` (`opLabels` prop). */
export const OpLabelsContext = createContext<OpLabelMap | undefined>(undefined);

/** The current lab's op labels (`undefined` when the producer declares none). */
export function useOpLabels(): OpLabelMap | undefined {
  return useContext(OpLabelsContext);
}
