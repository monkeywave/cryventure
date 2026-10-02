// @vitest-environment jsdom
import '@cryventure/viz/testing/setup';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import enPrologue from '../../i18n/en/prologue.json' with { type: 'json' };
import enLens from '../../i18n/en/lens.json' with { type: 'json' };
import dePrologue from '../../i18n/de/prologue.json' with { type: 'json' };
import deLens from '../../i18n/de/lens.json' with { type: 'json' };
import { emptyProgress, getProgress, replaceProgress } from '../../progress/index.ts';
import type { FillRandom } from './noteBytes.ts';
import Prologue from './Prologue.tsx';

const EN = { ...enPrologue, ...enLens };
const DE = { ...dePrologue, ...deLens };
/** Deterministic "random" key: every byte 0x2a. */
const fill: FillRandom = (bytes) => bytes.fill(0x2a);

const renderPrologue = (messages = EN, locale = 'en') => render(<Prologue messages={messages} locale={locale} fill={fill} />);
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const heading = () => screen.getByRole('heading', { level: 2 });

beforeEach(() => act(() => replaceProgress(emptyProgress())));
afterEach(cleanup);

describe('Prologue', () => {
  it('starts with Alice’s note, which Eve reads in the clear', () => {
    renderPrologue();
    expect(heading().textContent).toBe('Alice writes a note');
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Alice’s note to Bob' }).value).toBe('Meet me at the bridge');
    expect(screen.getByText('21 / 32 bytes')).toBeTruthy();
    expect(document.querySelector('.cv-eve .cv-hex')?.textContent).toMatch(/^4d 65 65 74/);
  });

  it('XORs the note so Eve sees noise, then Bob recovers it', async () => {
    renderPrologue();
    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.type(screen.getByRole('textbox'), 'Hi');
    await userEvent.click(button(/Next/));
    expect(heading().textContent).toBe('A shared secret key');
    expect(document.activeElement).toBe(heading());
    // 'H' 0x48 ⊕ 0x2a = 0x62, 'i' 0x69 ⊕ 0x2a = 0x43
    expect(screen.getByRole('listitem', { name: 'Byte 1: 48 XOR 2a = 62' })).toBeTruthy();
    expect(document.querySelector('.cv-eve .cv-hex')?.textContent).toBe('62 43');
    expect(screen.getByText('Unreadable noise')).toBeTruthy();

    await userEvent.click(button(/Next/));
    expect(heading().textContent).toBe('Bob unlocks the note');
    expect(document.querySelector('.cv-prologue__bob-note')?.textContent).toBe('Hi');
  });

  it('does not continue with an empty note', async () => {
    renderPrologue();
    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.click(button(/Next/));
    expect(heading().textContent).toBe('Alice writes a note');
    expect(screen.getByRole('status').textContent).toBe('Type at least one character to continue.');
  });

  it('goes back a scene', async () => {
    renderPrologue();
    await userEvent.click(button(/Next/));
    await userEvent.click(button(/Back/));
    expect(heading().textContent).toBe('Alice writes a note');
  });

  it('can skip straight to choosing a lens, which sets it and completes the prologue', async () => {
    renderPrologue();
    await userEvent.click(button('Skip intro'));
    expect(heading().textContent).toBe('How do you want to explore?');
    await userEvent.click(button(/Cryptographer/));
    expect(getProgress().lens).toBe('cryptographer');
    expect(getProgress().prologue?.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(heading().textContent).toBe('You’re all set');
    expect(screen.getByRole('link', { name: /Learn XOR properly/ }).getAttribute('href')).toBe('../xor/');
    expect(screen.getByRole('link', { name: 'AES — first look' }).getAttribute('href')).toBe('../welcome-lab/');
  });

  it('welcomes back a learner who already finished and lets them replay', async () => {
    act(() => replaceProgress({ ...emptyProgress(), lens: 'story', prologue: { completedAt: '2026-09-30T10:00:00.000Z' } }));
    renderPrologue();
    expect(heading().textContent).toBe('Welcome back');
    expect(screen.getByText(/finished the prologue on September 30, 2026\. Your lens: Story\./)).toBeTruthy();
    await userEvent.click(button('Replay the prologue'));
    expect(heading().textContent).toBe('Alice writes a note');
  });

  it('renders German with a German default note', () => {
    renderPrologue(DE, 'de');
    expect(heading().textContent).toBe('Alice schreibt eine Notiz');
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('Treffen an der Brücke');
    expect(screen.getByText('22 / 32 Byte')).toBeTruthy();
  });

  it('renders a neutral placeholder on the server, so returning learners never see the tour flash', () => {
    const html = renderToString(<Prologue messages={EN} locale="en" />);
    expect(html).toContain('cv-prologue__placeholder');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('Alice writes a note');
    expect(html).not.toContain('Welcome back');
  });
});
