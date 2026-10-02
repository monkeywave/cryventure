import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RecordingTracer, type RegionSpec, type TraceBundle } from '@cryventure/core';
import { LabLayoutProvider } from '@cryventure/viz';
import { loadVizMessages } from '@cryventure/viz/messages';
import { renderLab } from '@cryventure/viz/testing';
import { loadViewMessages } from '../messages.ts';
import StateView from './StateView.tsx';

type Region = 'state' | 'w';
const regions: RegionSpec<Region>[] = [
  { id: 'state', labelKey: 'r.state', elem: 'u8', shape: [4, 4], order: 'col-major' },
  { id: 'w', labelKey: 'r.w', elem: 'u8', shape: [44, 4], order: 'row-major' },
];
const regionMessages = { 'r.state': 'State', 'r.w': 'Key schedule w[i]' };

function largeRegionBundle(): TraceBundle {
  const tracer = new RecordingTracer<Region, { op: 'load' }>(regions, { state: new Array<number>(16).fill(0), w: new Array<number>(176).fill(1) });
  tracer.step({ op: 'load', writes: [{ region: 'state', offset: 0, values: [1] }], highlights: [], narration: { key: 'r.load' } });
  const state = tracer.toFacet();
  return { schemaVersion: 1, producer: { kind: 'primitive', id: 'big', apiVersion: 1 }, provenance: 'modeled', params: {}, facets: { 'state@default': state }, output: {} };
}

function renderStateView(narrow: boolean, locale: 'en' | 'de' = 'en') {
  return renderLab(
    <LabLayoutProvider narrow={narrow}>
      <StateView labId="big" lens="engineer" />
    </LabLayoutProvider>,
    { bundle: largeRegionBundle(), messages: { ...loadVizMessages(locale), ...loadViewMessages(locale), ...regionMessages } },
  );
}

const toggle = (name = 'Key schedule w[i] · 176 bytes') => screen.getByRole('button', { name });

describe('StateView large regions', () => {
  it('shows large regions expanded on wide labs, small regions without a disclosure', () => {
    renderStateView(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('grid', { name: 'Key schedule w[i]' })).toBeTruthy();
    expect(screen.getByRole('grid', { name: 'State' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('hides the region caption visually inside a disclosure (the button already names it) but keeps it for screen readers', () => {
    const { container } = renderStateView(false);
    const caption = (id: string) => container.querySelector(`[data-region="${id}"] figcaption`);
    expect(caption('w')?.classList.contains('cv-visually-hidden')).toBe(true);
    expect(caption('w')?.textContent).toBe('Key schedule w[i]');
    expect(caption('state')?.classList.contains('cv-visually-hidden')).toBe(false);
  });

  it('collapses large regions on narrow labs and expands them on request', async () => {
    const { store } = renderStateView(true);
    const button = toggle();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('grid', { name: 'Key schedule w[i]' })).toBeNull();
    expect(document.getElementById(button.getAttribute('aria-controls') ?? '')?.hidden).toBe(true);
    await userEvent.click(button);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('grid', { name: 'Key schedule w[i]' })).toBeTruthy();
    expect(store.getState().regionsExpanded).toEqual({ w: true });
  });

  it("keeps the learner's choice from the lab store over the layout default", () => {
    const { store } = renderStateView(false);
    act(() => store.getState().setRegionExpanded('w', false));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('summarises in German', () => {
    renderStateView(true, 'de');
    expect(toggle('Key schedule w[i] · 176 Byte')).toBeTruthy();
  });
});
