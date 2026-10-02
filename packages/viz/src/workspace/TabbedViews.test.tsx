import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { TabbedViews } from './TabbedViews.tsx';
import { fakeView } from './testViews.tsx';

const messages = { 'ui.workspace.views': 'Views', 'view.a.title': 'Alpha', 'view.b.title': 'Beta', 'view.c.title': 'Gamma' };

describe('TabbedViews', () => {
  it('renders a labelled tablist and mounts only the active view', async () => {
    render(
      <I18nProvider messages={messages}>
        <TabbedViews manifests={[fakeView('a'), fakeView('b'), fakeView('c')]} labId="lab" lens="story" />
      </I18nProvider>,
    );
    expect(screen.getByRole('tablist', { name: 'Views' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Alpha' }).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByText('view a (lab/story)')).toBeTruthy();

    await userEvent.click(screen.getByRole('tab', { name: 'Beta' }));
    expect(await screen.findByText('view b (lab/story)')).toBeTruthy();
    expect(screen.queryByText('view a (lab/story)')).toBeNull();
    expect(screen.getByRole('tabpanel', { name: 'Beta' })).toBeTruthy();
  });

  it('moves between tabs with arrow keys, Home and End (wrapping)', () => {
    render(
      <I18nProvider messages={messages}>
        <TabbedViews manifests={[fakeView('a'), fakeView('b'), fakeView('c')]} labId="lab" lens="story" />
      </I18nProvider>,
    );
    const tab = (name: string) => screen.getByRole('tab', { name });
    fireEvent.keyDown(tab('Alpha'), { key: 'ArrowLeft' });
    expect(tab('Gamma').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Gamma'));
    fireEvent.keyDown(tab('Gamma'), { key: 'ArrowRight' });
    expect(tab('Alpha').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab('Alpha'), { key: 'End' });
    expect(tab('Gamma').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab('Gamma'), { key: 'Home' });
    expect(tab('Alpha').tabIndex).toBe(0);
  });
});
