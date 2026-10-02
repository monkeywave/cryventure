import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { vizMessages } from '../i18n/messages.ts';
import { savePanelSizes } from './layoutStorage.ts';
import { installResizeObserverMock } from './resizeObserverMock.ts';
import { fakeView } from './testViews.tsx';
import { initialPanelSizes, Workspace, type WorkspaceProps } from './Workspace.tsx';
import { planPanels } from './planPanels.ts';

afterEach(() => vi.restoreAllMocks());

const messages = { ...vizMessages.en, 'view.state.title': 'State', 'view.narration.title': 'Narration', 'view.memory.title': 'Memory' };
const views = [fakeView('state'), fakeView('narration'), fakeView('memory')];

const renderWorkspace = (props: Partial<WorkspaceProps> = {}) =>
  render(
    <I18nProvider messages={messages}>
      <Workspace labId="aes" lens="engineer" views={views} {...props} />
    </I18nProvider>,
  );

const panelOrder = () => [...document.querySelectorAll('[data-view]')].map((el) => el.getAttribute('data-view'));

describe('Workspace', () => {
  it('renders the preset as resizable panels with a labelled separator', async () => {
    renderWorkspace({ layout: 'narration|state', views: views.slice(0, 2) });
    expect(screen.getByRole('group', { name: 'Lab workspace' })).toBeTruthy();
    expect(await screen.findByText('view narration (aes/engineer)')).toBeTruthy();
    expect(await screen.findByText('view state (aes/engineer)')).toBeTruthy();
    expect(panelOrder()).toEqual(['narration', 'state']);
    expect(screen.getByRole('separator', { name: 'Resize panels' })).toBeTruthy();
  });

  it('puts overflow views into tabs', async () => {
    renderWorkspace({ layout: 'state|narration' });
    expect(screen.getByRole('tab', { name: 'Narration' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Memory' })).toBeTruthy();
    expect(await screen.findByText('view state (aes/engineer)')).toBeTruthy();
  });

  it('shows an empty-state message without views', () => {
    renderWorkspace({ views: [] });
    expect(screen.getByRole('status').textContent).toBe('No views are available for this lab.');
  });

  it('applies saved sizes for the same panel set', () => {
    savePanelSizes('aes', ['state', 'narration'], { state: 70, narration: 30 });
    renderWorkspace({ layout: 'state|narration', views: views.slice(0, 2) });
    const panel = document.querySelector<HTMLElement>('[data-panel][id="state"]');
    expect(panel?.style.flexGrow ?? '').toMatch(/^70/);
  });

  it('still renders when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    renderWorkspace({ layout: 'state' });
    expect(await screen.findByText('view state (aes/engineer)')).toBeTruthy();
  });

  it('applies preset default sizes when nothing is saved', () => {
    renderWorkspace({ layout: 'state:60|narration:40', views: views.slice(0, 2) });
    const panel = document.querySelector<HTMLElement>('[data-panel][id="state"]');
    expect(panel?.style.flexGrow ?? '').toMatch(/^60/);
  });

  it('stacks panels without separators in a narrow container and returns to columns when wide', async () => {
    const mock = installResizeObserverMock();
    renderWorkspace({ layout: 'state|narration', views: views.slice(0, 2) });
    const group = screen.getByRole('group', { name: 'Lab workspace' });
    expect(group.dataset['layout']).toBe('columns');
    act(() => mock.resize(group, 390));
    expect(group.dataset['layout']).toBe('stacked');
    expect(screen.queryByRole('separator')).toBeNull();
    expect(await screen.findByText('view narration (aes/engineer)')).toBeTruthy();
    expect([...document.querySelectorAll('[data-panel-id]')].map((el) => el.getAttribute('data-panel-id'))).toEqual(['state', 'narration']);
    act(() => mock.resize(group, 1000));
    expect(group.dataset['layout']).toBe('columns');
    expect(screen.getByRole('separator', { name: 'Resize panels' })).toBeTruthy();
    mock.restore();
  });
});

describe('initialPanelSizes', () => {
  const plans = planPanels(['state', 'narration'], 'state:60|narration:40');

  it('prefers saved sizes over preset defaults', () => {
    savePanelSizes('aes', ['state', 'narration'], { state: 70, narration: 30 });
    expect(initialPanelSizes('aes', plans)).toEqual({ state: 70, narration: 30 });
  });

  it('falls back to the preset defaults, then to undefined', () => {
    expect(initialPanelSizes('aes', plans)).toEqual({ state: 60, narration: 40 });
    expect(initialPanelSizes('aes', planPanels(['state', 'narration'], 'state|narration'))).toBeUndefined();
  });
});
