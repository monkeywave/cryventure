// @vitest-environment jsdom
import '@cryventure/viz/testing/setup';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LabLayoutProvider } from '@cryventure/viz';
import { createFixtureBundle, fixtureMessages, renderLab } from '@cryventure/viz/testing';
import { labMessages } from '../../labs/labMessages.ts';
import { PlayerBar, VIEWS_SHOWN_IN_CAPTION } from './PlayerBar.tsx';

function renderBar(narrow: boolean, lang = 'en') {
  const result = renderLab(
    <LabLayoutProvider narrow={narrow}>
      <PlayerBar />
    </LabLayoutProvider>,
    { bundle: createFixtureBundle(), messages: { ...labMessages(lang, 'aes'), ...fixtureMessages } },
  );
  return { ...result, player: document.querySelector<HTMLElement>('.cv-lab__player') };
}

const breakpoints = (name = 'Breakpoints') => screen.getByRole('group', { name });

describe('PlayerBar', () => {
  it('keeps the wide chrome: controls, timeline and breakpoints in one row, no caption', () => {
    const { player } = renderBar(false);
    expect(player?.contains(screen.getByRole('group', { name: 'Playback controls' }))).toBe(true);
    expect(player?.contains(breakpoints())).toBe(true);
    expect(screen.queryByRole('group', { name: 'Narration' })).toBeNull();
  });

  it('adds the caption to the narrow mini-player and moves the breakpoints below it', () => {
    const { player } = renderBar(true);
    expect(player?.contains(screen.getByRole('group', { name: 'Narration' }))).toBe(true);
    expect(player?.contains(breakpoints())).toBe(false);
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it('renders the German caption', () => {
    renderBar(true, 'de');
    expect(screen.getByRole('group', { name: 'Erläuterung' }).textContent).toContain('Ausgangszustand');
  });

  it('hands the narration view over to the caption on narrow labs', () => {
    expect(VIEWS_SHOWN_IN_CAPTION).toEqual(['narration']);
  });
});
