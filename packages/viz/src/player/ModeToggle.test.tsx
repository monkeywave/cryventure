import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { vizMessages } from '../i18n/messages.ts';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { renderLab } from '../testing/renderLab.tsx';
import { ModeToggle } from './ModeToggle.tsx';

const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

describe('ModeToggle', () => {
  it('renders a labelled group of two toggle buttons with debugger pressed by default', () => {
    renderLab(<ModeToggle />, { bundle: createFixtureBundle() });
    const group = screen.getByRole('group', { name: 'Player mode' });
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['Story', 'Debugger']);
    expect(pressed('Story')).toBe('false');
    expect(pressed('Debugger')).toBe('true');
  });

  it('switches the store mode and keeps exactly one button pressed', async () => {
    const user = userEvent.setup();
    const { store } = renderLab(<ModeToggle />, { bundle: createFixtureBundle() });
    await user.click(screen.getByRole('button', { name: 'Story' }));
    expect(store.getState().mode).toBe('story');
    expect(pressed('Story')).toBe('true');
    expect(pressed('Debugger')).toBe('false');
    await user.click(screen.getByRole('button', { name: 'Debugger' }));
    expect(store.getState().mode).toBe('debugger');
    expect(pressed('Debugger')).toBe('true');
  });

  it('follows mode changes from the store', () => {
    const { store } = renderLab(<ModeToggle />);
    act(() => store.getState().setMode('story'));
    expect(pressed('Story')).toBe('true');
  });

  it('translates to German', () => {
    renderLab(<ModeToggle />, { messages: vizMessages.de });
    expect(screen.getByRole('group', { name: vizMessages.de['ui.player.mode'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: vizMessages.de['ui.player.mode.story'] })).toBeTruthy();
  });
});
