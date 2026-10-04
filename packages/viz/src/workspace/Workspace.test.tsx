import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { vizMessages } from '../i18n/messages.ts';
import { savePanelSizes } from './layoutStorage.ts';
import { installResizeObserverMock } from './resizeObserverMock.ts';
import { fakeView } from './testViews.tsx';
import { initialPanelSizes, Workspace, type WorkspaceProps } from './Workspace.tsx';
import { planPanels } from './planPanels.ts';
import { LabLayoutProvider } from '../lab/LabLayout.tsx';
import { renderLab } from '../testing/renderLab.tsx';
import '../viz.css';

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

  it('drops a layout panel whose view disappears after a re-run, without crashing', async () => {
    const { rerender } = renderWorkspace({ layout: 'memory|state' });
    expect(await screen.findByText('view memory (aes/engineer)')).toBeTruthy();
    rerender(
      <I18nProvider messages={messages}>
        <Workspace labId="aes" lens="engineer" views={views.slice(0, 2)} layout="memory|state" />
      </I18nProvider>,
    );
    expect(await screen.findByText('view state (aes/engineer)')).toBeTruthy();
    expect(panelOrder()).not.toContain('memory');
  });

  it('shows an empty-state message without views', () => {
    renderWorkspace({ views: [] });
    expect(screen.getByRole('status').textContent).toBe('No views are available for this lab.');
    expect(screen.getByRole('status').dataset['status']).toBe('empty');
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

  it('top-aligns side-by-side panels at their own height while the separator spans the row', () => {
    renderWorkspace({ layout: 'state|narration', views: views.slice(0, 2) });
    const group = document.querySelector<HTMLElement>('.cv-workspace [data-group]');
    expect(group).not.toBeNull();
    expect(getComputedStyle(group as HTMLElement).alignItems).toBe('flex-start');
    expect(getComputedStyle(screen.getByRole('separator', { name: 'Resize panels' })).alignSelf).toBe('stretch');
    const panels = [...document.querySelectorAll<HTMLElement>('.cv-workspace__panel')];
    expect(panels).toHaveLength(2);
    for (const panel of panels) expect(getComputedStyle(panel).height).not.toBe('100%');
  });

  it('applies preset default sizes when nothing is saved', () => {
    renderWorkspace({ layout: 'state:60|narration:40', views: views.slice(0, 2) });
    const panel = document.querySelector<HTMLElement>('[data-panel][id="state"]');
    expect(panel?.style.flexGrow ?? '').toMatch(/^60/);
  });

  it('stacks panels without separators in a narrow lab and returns to columns when wide', async () => {
    const mock = installResizeObserverMock();
    renderLab(<Workspace labId="aes" lens="engineer" views={views.slice(0, 2)} layout="state|narration" />, { messages });
    const group = screen.getByRole('group', { name: 'Lab workspace' });
    const lab = screen.getByRole('region', { name: 'Interactive lab' });
    expect(group.dataset['layout']).toBe('columns');
    act(() => mock.resize(lab, 390));
    expect(group.dataset['layout']).toBe('stacked');
    expect(screen.queryByRole('separator')).toBeNull();
    expect(await screen.findByText('view narration (aes/engineer)')).toBeTruthy();
    expect([...document.querySelectorAll('[data-panel-id]')].map((el) => el.getAttribute('data-panel-id'))).toEqual(['state', 'narration']);
    act(() => mock.resize(lab, 1000));
    expect(group.dataset['layout']).toBe('columns');
    expect(screen.getByRole('separator', { name: 'Resize panels' })).toBeTruthy();
    mock.restore();
  });
});

describe('Workspace inside a lab layout', () => {
  const mainState = { ...fakeView('state'), defaultSlot: 'main' as const };
  const captionNarration = { ...fakeView('narration'), narrowPlacement: 'caption' as const };
  const renderInLab = (narrow: boolean, props: Partial<WorkspaceProps> = {}) =>
    render(
      <I18nProvider messages={messages}>
        <LabLayoutProvider narrow={narrow}>
          <Workspace labId="aes" lens="engineer" views={[captionNarration, mainState, fakeView('memory')]} layout="narration|state|memory" {...props} />
        </LabLayoutProvider>
      </I18nProvider>,
    );
  const stackedIds = () => [...document.querySelectorAll('[data-panel-id]')].map((el) => el.getAttribute('data-panel-id'));

  it('follows the lab layout instead of measuring itself', () => {
    renderInLab(true);
    expect(screen.getByRole('group', { name: 'Lab workspace' }).dataset['layout']).toBe('stacked');
  });

  it('stacks main-slot views first and leaves out caption views (narrowPlacement: caption) when narrow', () => {
    renderInLab(true);
    expect(stackedIds()).toEqual(['state', 'memory']);
    expect(screen.queryByText('view narration (aes/engineer)')).toBeNull();
  });

  it('stacks panels in the order of the layout preset when narrow (the first listed panel comes first)', () => {
    renderInLab(true, { layout: 'memory:55|state:20|narration:25' });
    expect(stackedIds()).toEqual(['memory', 'state']);
  });

  it('stacks main-slot views first when the lab gives no layout preset', () => {
    renderInLab(true, { layout: undefined, views: [captionNarration, fakeView('memory'), mainState] });
    expect(stackedIds()).toEqual(['state', 'memory']);
  });

  it('is wide outside a lab', () => {
    renderWorkspace({ layout: 'state|narration', views: views.slice(0, 2) });
    expect(screen.getByRole('group', { name: 'Lab workspace' }).dataset['layout']).toBe('columns');
  });

  it('shows every view in preset order when wide', async () => {
    renderInLab(false);
    expect(screen.getByRole('group', { name: 'Lab workspace' }).dataset['layout']).toBe('columns');
    expect(await screen.findByText('view narration (aes/engineer)')).toBeTruthy();
    expect(panelOrder()).toEqual(['narration', 'state', 'memory']);
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
