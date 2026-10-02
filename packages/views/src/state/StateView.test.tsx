import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ChoreographyModule } from '@cryventure/core';
import { I18nProvider, LabRoot, createLabStore } from '@cryventure/viz';
import { vizMessages } from '@cryventure/viz/messages';
import { createFixtureBundle, createManualScheduler, fixtureMessages, renderLab } from '@cryventure/viz/testing';
import { loadViewMessages } from '../messages.ts';
import StateView from './StateView.tsx';

const messages = { ...loadViewMessages('en'), ...fixtureMessages };
const renderState = (bundle = createFixtureBundle()) => renderLab(<StateView labId="fixture" lens="engineer" />, { bundle, messages });

describe('StateView', () => {
  it('shows each region at the initial state without highlights', () => {
    renderState();
    const state = screen.getByRole('grid', { name: 'State' });
    expect(within(state).getAllByRole('gridcell')).toHaveLength(16);
    expect(within(state).getByRole('gridcell', { name: 'row 1, column 1, value 0x00' })).toBeTruthy();
    expect(document.querySelectorAll('[data-highlight]')).toHaveLength(0);
  });

  it('renders the [n,4] key schedule as wrapping word rows w0…w11', () => {
    renderState();
    const schedule = screen.getByRole('grid', { name: 'Key schedule' });
    expect(schedule.classList.contains('cv-grid--wrap')).toBe(true);
    expect(within(schedule).getAllByRole('row')).toHaveLength(12);
    const headers = within(schedule).getAllByRole('rowheader');
    expect(headers.map((header) => header.textContent)).toEqual(Array.from({ length: 12 }, (_, i) => `w${i}`));
    expect(headers[0]?.getAttribute('aria-label')).toBe('word 0');
    expect(within(schedule).getByRole('gridcell', { name: 'row 2, column 1, value 0x04' })).toBeTruthy();
  });

  it('marks the words the current step works with', () => {
    const { store } = renderState();
    act(() => store.getState().seek(2));
    const schedule = screen.getByRole('grid', { name: 'Key schedule' });
    const current = within(schedule).getAllByRole('row').filter((row) => row.hasAttribute('data-current'));
    expect(current).toHaveLength(1);
    expect(within(current[0]!).getByRole('rowheader').getAttribute('aria-label')).toBe('word 4, used in this step');
  });

  it('follows the playhead with values (col-major) and step highlights', () => {
    const { store } = renderState();
    act(() => store.getState().seek(1));
    const state = screen.getByRole('grid', { name: 'State' });
    expect(within(state).getByRole('gridcell', { name: 'row 1, column 1, value 0xaa, substituted by the S-box' })).toBeTruthy();
    expect(within(state).getByRole('gridcell', { name: 'row 2, column 1, value 0xbb, substituted by the S-box' })).toBeTruthy();
    expect(within(state).getByRole('gridcell', { name: 'row 1, column 2, value 0x14' })).toBeTruthy();

    act(() => store.getState().seek(2));
    const schedule = screen.getByRole('grid', { name: 'Key schedule' });
    expect(within(schedule).getByRole('gridcell', { name: 'row 5, column 1, value 0xff, XOR-combined' })).toBeTruthy();
  });

  it('explains when there is no state facet or no bundle yet', () => {
    renderState({ ...createFixtureBundle(), facets: {} });
    expect(screen.getByRole('status').textContent).toBe('This lab does not record a state to show.');
  });

  it('shows a loading status before a bundle arrives', () => {
    renderLab(<StateView labId="fixture" lens="engineer" />, { messages });
    expect(screen.getByRole('status').textContent).toBe('Preparing the state…');
  });
});

describe('StateView watch', () => {
  const hint = () => screen.queryByText('Select a cell to watch its value across the steps.');
  const stateCell = (name: string) => within(screen.getByRole('grid', { name: 'State' })).getByRole('gridcell', { name });

  it('shows a hint in debugger mode until a cell is selected', () => {
    const { store } = renderState();
    expect(store.getState().mode).toBe('debugger');
    expect(hint()).not.toBeNull();
    expect(screen.queryByRole('region', { name: /Watching/ })).toBeNull();
  });

  it("watches a clicked cell's value history up to the playhead", async () => {
    const user = userEvent.setup();
    const { store } = renderState();
    await user.click(stateCell('row 1, column 1, value 0x00'));
    expect(store.getState().selection.node).toEqual({ region: 'state', index: 0 });
    expect(stateCell('row 1, column 1, value 0x00').getAttribute('aria-selected')).toBe('true');
    expect(hint()).toBeNull();
    const panel = screen.getByRole('region', { name: 'Watching State[0]' });
    expect(within(panel).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['step start: 0x00']);

    act(() => store.getState().seek(1));
    const entries = within(panel).getAllByRole('listitem');
    expect(entries.map((item) => item.textContent)).toEqual(['step start: 0x00', 'step 1: 0x10', 'step 2: 0xaa']);
    expect(entries.map((item) => item.getAttribute('aria-current'))).toEqual([null, null, 'step']);

    act(() => store.getState().seek(0));
    expect(within(panel).getAllByRole('listitem')).toHaveLength(2);
  });

  it('selects with Enter and stops watching with the clear button', async () => {
    const user = userEvent.setup();
    const { store } = renderState();
    stateCell('row 1, column 1, value 0x00').focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('region', { name: 'Watching State[0]' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Stop watching' }));
    expect(store.getState().selection.node).toBeNull();
    expect(screen.queryByRole('region', { name: /Watching/ })).toBeNull();
    expect(hint()).not.toBeNull();
  });

  it('watches key schedule cells by their flat index', async () => {
    const user = userEvent.setup();
    const { store } = renderState();
    await user.click(within(screen.getByRole('grid', { name: 'Key schedule' })).getByRole('gridcell', { name: 'row 5, column 1, value 0x10' }));
    expect(store.getState().selection.node).toEqual({ region: 'w', index: 16 });
    act(() => store.getState().seek(2));
    const panel = screen.getByRole('region', { name: 'Watching Key schedule[16]' });
    expect(within(panel).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['step start: 0x10', 'step 3: 0xff']);
  });

  it('hides the watch area in story mode', () => {
    const { store } = renderState();
    act(() => store.getState().selectNode({ region: 'state', index: 0 }));
    expect(screen.getByRole('region', { name: 'Watching State[0]' })).toBeTruthy();
    act(() => store.getState().setMode('story'));
    expect(screen.queryByRole('region', { name: /Watching/ })).toBeNull();
    expect(hint()).toBeNull();
  });
});

describe('StateView choreography', () => {
  const allMessages = { ...vizMessages.en, ...messages };

  function renderStory(module?: ChoreographyModule) {
    const store = createLabStore(createFixtureBundle());
    const scheduler = createManualScheduler();
    render(
      <I18nProvider messages={allMessages}>
        <LabRoot store={store} scheduler={scheduler} choreography={module}>
          <StateView labId="fixture" lens="story" />
        </LabRoot>
      </I18nProvider>,
    );
    act(() => {
      store.getState().setMode('story');
      store.getState().seek(0);
    });
    act(() => store.getState().next());
    return { store, scheduler };
  }
  const firstStateCell = () => within(screen.getByRole('grid', { name: 'State' })).getAllByRole('gridcell')[0]!;
  const shownValue = () => firstStateCell().querySelector('.cv-cell__value')?.textContent;
  const dimmedIn = (grid: string) => within(screen.getByRole('grid', { name: grid })).getAllByRole('gridcell').filter((cell) => cell.hasAttribute('data-dimmed'));

  it('shows the value before the step until the switch point, labelled with the end value', () => {
    const { store } = renderStory();
    expect(store.getState().step).toBe(1);
    expect(store.getState().progress.get()).toBe(0);
    expect(shownValue()).toBe('10');
    expect(firstStateCell().getAttribute('aria-label')).toBe('row 1, column 1, value 0xaa, substituted by the S-box');
    act(() => store.getState().progress.set(1));
    expect(shownValue()).toBe('aa');
  });

  it('animates the step through the playback clock', () => {
    const { store, scheduler } = renderStory();
    expect(firstStateCell().hasAttribute('data-animated')).toBe(true);
    act(() => scheduler.advance(2000));
    expect(store.getState().progress.get()).toBe(1);
    expect(shownValue()).toBe('aa');
  });

  it("dims cells outside the beat's focus while the step is in flight", () => {
    const focusFirst: ChoreographyModule = { choreograph: () => ({ duration: 1, tracks: [], beats: [{ at: 0, focus: { region: 'state', indices: [0] } }] }) };
    const { store } = renderStory(focusFirst);
    act(() => store.getState().progress.set(0.3));
    expect(dimmedIn('State')).toHaveLength(15);
    expect(firstStateCell().hasAttribute('data-dimmed')).toBe(false);
    expect(dimmedIn('Key schedule')).toHaveLength(0);
    act(() => store.getState().progress.set(1));
    expect(dimmedIn('State')).toHaveLength(0);
  });

  it('never dims after an exact jump', () => {
    const focusFirst: ChoreographyModule = { choreograph: () => ({ duration: 1, tracks: [], beats: [{ at: 0, focus: { region: 'state', indices: [0] } }] }) };
    const { store } = renderStory(focusFirst);
    act(() => store.getState().seek(2));
    expect(document.querySelectorAll('[data-dimmed]')).toHaveLength(0);
  });
});
