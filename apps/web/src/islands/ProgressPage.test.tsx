// @vitest-environment jsdom
import '@cryventure/viz/testing/setup';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../i18n/en/quiz.json' with { type: 'json' };
import de from '../i18n/de/quiz.json' with { type: 'json' };
import { emptyProgress, exportProgress, getProgress, replaceProgress, type Progress } from '../progress/index.ts';
import ProgressPage from './ProgressPage.tsx';

function questions(...ids: string[]) {
  return ids.map((id, index) => ({ id, number: index + 1 }));
}

const LESSONS = [
  { key: 'symmetric/aes', title: 'AES at a glance', href: '/en/symmetric/aes/', questions: questions('aes192-rounds', 'input-byte-5-position', 'final-round-omits') },
  { key: 'symmetric/aes/subbytes-sbox', title: 'SubBytes and the S-box', href: '/en/symmetric/aes/subbytes-sbox/', questions: questions('sbox-of-00', 'sbox-fixed-points', 'sbox-nonlinearity') },
];

const answer = (correct: boolean) => ({ solved: correct, lastAnswer: 0 });
const SAMPLE: Progress = { version: 2, lens: 'story', lessons: { 'symmetric/aes': { quiz: { 'aes192-rounds': answer(true), 'input-byte-5-position': answer(true), 'final-round-omits': answer(false) } } } };

const renderPage = (messages: Record<string, string> = en, locale = 'en') => render(<ProgressPage lessons={LESSONS} messages={messages} locale={locale} />);
const lessonItem = (title: string) => screen.getByRole('link', { name: title }).closest('li') as HTMLElement;
const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => act(() => replaceProgress(SAMPLE)));
afterEach(() => {
  vi.restoreAllMocks();
  act(() => replaceProgress(emptyProgress()));
});

describe('ProgressPage lesson list', () => {
  it('shows each lesson with its score and links to it', () => {
    renderPage();
    expect(lessonItem('AES at a glance').textContent).toContain('2 of 3 answered correctly');
    expect(lessonItem('SubBytes and the S-box').textContent).toContain('Not started yet');
    expect(screen.getByRole('link', { name: 'AES at a glance' }).getAttribute('href')).toBe('/en/symmetric/aes/');
  });

  it('scores answers migrated from v1 by their question number', () => {
    act(() => replaceProgress({ version: 2, lessons: { 'symmetric/aes/subbytes-sbox': { quiz: { 'sbox-of-00': answer(true) }, legacyQuiz: { '2': answer(true), '3': answer(false) } } } }));
    renderPage();
    expect(lessonItem('SubBytes and the S-box').textContent).toContain('2 of 3 answered correctly');
  });

  it('renders German', () => {
    renderPage(de, 'de');
    expect(lessonItem('AES at a glance').textContent).toContain('2 von 3 richtig beantwortet');
  });
});

describe('ProgressPage export', () => {
  it('downloads the progress as cryventure-progress.json', async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:progress';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('cryventure-progress.json');
      expect(this.href).toBe('blob:progress');
    });
    renderPage();
    await userEvent.click(button('Export progress'));
    expect(click).toHaveBeenCalledOnce();
    expect(await blobs[0]?.text()).toBe(exportProgress(SAMPLE));
  });
});

describe('ProgressPage import', () => {
  const upload = (content: string) => userEvent.upload(screen.getByLabelText('Import progress'), new File([content], 'progress.json', { type: 'application/json' }));

  it('replaces progress with a valid export', async () => {
    act(() => replaceProgress(emptyProgress()));
    renderPage();
    await upload(exportProgress(SAMPLE));
    expect(await screen.findByText('Progress imported.')).toBeTruthy();
    expect(getProgress().lessons).toEqual(SAMPLE.lessons);
    expect(lessonItem('AES at a glance').textContent).toContain('2 of 3');
  });

  it("keeps this device's lens (a preference, not progress) when importing", async () => {
    act(() => replaceProgress({ ...emptyProgress(), lens: 'cryptographer' }));
    renderPage();
    await upload(exportProgress(SAMPLE));
    expect(await screen.findByText('Progress imported.')).toBeTruthy();
    expect(getProgress()).toEqual({ ...SAMPLE, lens: 'cryptographer' });
  });

  it('does not adopt the exported lens on a device without one', async () => {
    act(() => replaceProgress(emptyProgress()));
    renderPage();
    await upload(exportProgress(SAMPLE));
    expect(await screen.findByText('Progress imported.')).toBeTruthy();
    expect(getProgress().lens).toBeUndefined();
  });

  it.each([
    ['not json', 'This file is not valid JSON.'],
    ['{"version":1,"lessons":{}}', 'This file is not a CryVenture progress export.'],
    ['{"format":"cryventure-progress","version":99,"lessons":{}}', 'This export comes from a newer version of CryVenture and cannot be read here.'],
  ])('rejects %s with a translated error', async (content, message) => {
    renderPage();
    await upload(content);
    expect(await screen.findByText(message)).toBeTruthy();
    expect(getProgress()).toEqual(SAMPLE);
  });
});

describe('ProgressPage reset', () => {
  it('asks in the page before resetting, then keeps only the lens', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    renderPage();
    await userEvent.click(button('Reset progress'));
    const dialog = screen.getByRole('group', { name: /Delete all quiz results/ });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Yes, reset' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, reset' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(getProgress()).toEqual({ version: 2, lens: 'story', lessons: {} });
    expect(screen.getByText('Progress reset.')).toBeTruthy();
    expect(lessonItem('AES at a glance').textContent).toContain('Not started yet');
  });

  it('cancels without changing progress and returns focus', async () => {
    renderPage();
    await userEvent.click(button('Reset progress'));
    await userEvent.click(button('Cancel'));
    expect(getProgress()).toEqual(SAMPLE);
    expect(document.activeElement).toBe(button('Reset progress'));
  });
});
