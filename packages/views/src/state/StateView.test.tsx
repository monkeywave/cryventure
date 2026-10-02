import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFixtureBundle, fixtureMessages, renderLab } from '@cryventure/viz/testing';
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
