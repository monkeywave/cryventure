import type { FacetKind } from '@cryventure/core';
import { createLabStore } from '@cryventure/viz';
import { createFixtureBundle, renderLab } from '@cryventure/viz/testing';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { VariantPicker, useVariantChoice } from './VariantPicker.tsx';
import en from './i18n/en.json';

/** A stand-in view: its picker plus the facet it shows. */
function PickerView({ kind }: { kind: FacetKind }) {
  const { facet, options, chosen, choose } = useVariantChoice<string>(kind);
  return (
    <div data-kind={kind}>
      <VariantPicker label={kind} options={options} chosen={chosen} onChoose={choose} className="picker" />
      <output>{facet.data}</output>
    </div>
  );
}

function renderViews(preferredVariant?: string) {
  const bundle = createFixtureBundle();
  const store = createLabStore(bundle, { preferredVariant });
  store.getState().setDerivedFacets(bundle, {
    'instructions@aarch64-armv8-ce': 'arm listing',
    'instructions@x86_64-aesni': 'x86 listing',
    'registers@aarch64-armv8-ce': 'arm registers',
    'registers@x86_64-aesni': 'x86 registers',
    'memory@aarch64-armv8-ce': 'arm memory',
    'memory@x86_64-aesni': 'x86 memory',
  });
  return renderLab(
    <>
      <PickerView kind="instructions" />
      <PickerView kind="registers" />
      <PickerView kind="memory" />
    </>,
    { store },
  );
}

const shown = (kind: string) => document.querySelector(`[data-kind="${kind}"] output`)?.textContent;
const picker = (kind: string) => document.querySelector<HTMLSelectElement>(`[data-kind="${kind}"] select`)!;

function pick(kind: string, variant: string) {
  act(() => {
    picker(kind).value = variant;
    picker(kind).dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('useVariantChoice (lab-wide)', () => {
  it('shows the first variant in deriver order everywhere by default', () => {
    renderViews();
    expect([shown('instructions'), shown('registers'), shown('memory')]).toEqual(['arm listing', 'arm registers', 'arm memory']);
  });

  it('choosing in one view switches every view sharing the variant id', () => {
    renderViews();
    pick('instructions', 'x86_64-aesni');
    expect(shown('instructions')).toBe('x86 listing');
    expect(shown('registers')).toBe('x86 registers');
    expect(picker('registers').value).toBe('x86_64-aesni');
    expect(shown('memory')).toBe('x86 memory');
    expect(picker('memory').value).toBe('x86_64-aesni');
  });

  it("starts from the host's preferred variant, memory included (same id)", () => {
    renderViews('x86_64-aesni');
    expect([shown('instructions'), shown('registers'), shown('memory')]).toEqual(['x86 listing', 'x86 registers', 'x86 memory']);
  });

  it('labels a variant whose facet has no label with a translated fallback, never the raw id', () => {
    const bundle = createFixtureBundle();
    const store = createLabStore(bundle);
    store.getState().setDerivedFacets(bundle, { 'instructions@a-1': { label: { key: 'view.test.a' } }, 'instructions@b-2': {} });
    function PickerOnly() {
      const { options, chosen, choose } = useVariantChoice('instructions');
      return (
        <div data-kind="instructions">
          <VariantPicker label="isa" options={options} chosen={chosen} onChoose={choose} className="picker" />
        </div>
      );
    }
    renderLab(<PickerOnly />, { store, messages: en });
    const texts = [...picker('instructions').options].map((option) => option.textContent);
    expect(texts).not.toContain('b-2');
    expect(texts[1]).toBe('Variant 2');
  });
});
