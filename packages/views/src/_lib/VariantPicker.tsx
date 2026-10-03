import { useId, useMemo } from 'react';
import type { FacetKind, I18nRef } from '@cryventure/core';
import {
  useFacet,
  useT,
  useVariantFacets,
  useVariantChoice as useLabVariantChoice,
  type FacetResult,
} from '@cryventure/viz';

/**
 * Facet variants (docs/M4.md §1f) as a picker built from the data: each variant's `label`, never the
 * variant string. The choice is lab-wide (viz `useVariantChoice`): picking `x86_64-aesni` here
 * switches every view with that variant; a kind without it keeps its first preferred or default one. Shared by the views through `_lib` (plugins never
 * import each other); each view passes its own translated `label` and `className`.
 */
export interface VariantOption {
  variant: string;
  label: I18nRef | undefined;
}

function useVariantOptions(kind: FacetKind, variants: readonly string[]): VariantOption[] {
  const facets = useVariantFacets<{ label?: I18nRef }>(kind, variants);
  return useMemo(() => facets.map(({ variant, data }) => ({ variant, label: data?.label })), [facets]);
}

export interface VariantChoice<T> {
  facet: FacetResult<T>;
  options: VariantOption[];
  chosen: string | undefined;
  choose: (variant: string) => void;
}

export function useVariantChoice<T>(kind: FacetKind): VariantChoice<T> {
  const { variants, current, choose } = useLabVariantChoice(kind);
  const options = useVariantOptions(kind, variants);
  const facet = useFacet<T>(kind, current);
  return { facet, options, chosen: current, choose };
}

interface VariantPickerProps {
  /** Translated label of the select. */
  label: string;
  options: readonly VariantOption[];
  chosen: string | undefined;
  onChoose: (variant: string) => void;
  className: string;
}

/** A variant's label: its facet's `label`, else a translated, numbered fallback (never the raw variant id). */
function optionLabel(option: VariantOption, index: number): I18nRef {
  return option.label ?? { key: 'view.variant.unlabelled', params: { n: index + 1 } };
}

/** A labelled `<select>` of the variants; nothing when there is only one. */
export function VariantPicker({ label, options, chosen, onChoose, className }: VariantPickerProps) {
  const t = useT();
  const id = useId();
  if (options.length <= 1) return null;
  return (
    <p className={className}>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={chosen} onChange={(event) => onChoose(event.target.value)}>
        {options.map((option, index) => (
          <option key={option.variant} value={option.variant}>
            {t(optionLabel(option, index))}
          </option>
        ))}
      </select>
    </p>
  );
}
