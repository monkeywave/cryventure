// @vitest-environment jsdom
import '@cryventure/viz/testing/setup';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '../../i18n/en/flyThrough.json' with { type: 'json' };
import de from '../../i18n/de/flyThrough.json' with { type: 'json' };
import FlyThrough from './FlyThrough.tsx';
import { BEAT_MS } from './useFlyThrough.ts';

const section = () => document.querySelector<HTMLElement>('.cv-fly')!;
const caption = () => document.querySelector('.cv-fly__caption')!;
/** By its visible label: `getByRole` walks the whole SVG for accessible names and is slow in jsdom. */
const button = (name: string) => screen.getByText(name, { selector: 'button' });
/** Byte `index`'s token in the current (non-fading-out) layer. */
const token = (index: number) => document.querySelector<SVGGElement>(`.cv-fly__tokens:not(.cv-fly__tokens--out) [data-byte="${index}"]`)!;

function mockReducedMotion(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({ matches: matches && query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('FlyThrough', () => {
  it('renders the matrix beat with its caption on the server', () => {
    const html = renderToString(<FlyThrough messages={en} locale="en" />);
    expect(html).toContain('data-beat="matrix"');
    expect(html).toContain('Round key 0 is the AES-128 key itself');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('ui.flyThrough.');
  });

  it('steps forward and back through matrix → xmm0 → RAM', () => {
    render(<FlyThrough messages={en} locale="en" />);
    expect(section().dataset['beat']).toBe('matrix');
    expect(button('Back')).toHaveProperty('disabled', true);
    fireEvent.click(button('Step'));
    expect(section().dataset['beat']).toBe('register');
    expect(caption().textContent).toContain('GETU32');
    fireEvent.click(button('Step'));
    expect(section().dataset['beat']).toBe('memory');
    expect(caption().textContent).toContain('reversed');
    expect(button('Step')).toHaveProperty('disabled', true);
    fireEvent.click(button('Back'));
    expect(section().dataset['beat']).toBe('register');
  });

  it('the impl toggle switches the RAM order of rd_key', () => {
    render(<FlyThrough messages={en} locale="en" />);
    fireEvent.click(button('Step'));
    fireEvent.click(button('Step'));
    const cref = token(0).style.transform;
    fireEvent.click(screen.getByRole('radio', { name: 'AES-NI' }));
    expect(section().dataset['impl']).toBe('aesni');
    expect(token(0).style.transform).not.toBe(cref);
    expect(caption().textContent).toContain('no word is reversed');
  });

  it('never plays on its own; Play advances beat by beat and stops at the end', () => {
    vi.useFakeTimers();
    render(<FlyThrough messages={en} locale="en" />);
    act(() => vi.advanceTimersByTime(BEAT_MS * 5));
    expect(section().dataset['beat']).toBe('matrix');
    fireEvent.click(button('Play'));
    expect(button('Pause')).toBeTruthy();
    act(() => vi.advanceTimersByTime(BEAT_MS));
    expect(section().dataset['beat']).toBe('register');
    act(() => vi.advanceTimersByTime(BEAT_MS));
    expect(section().dataset['beat']).toBe('memory');
    act(() => vi.advanceTimersByTime(BEAT_MS));
    expect(button('Play')).toBeTruthy();
  });

  it('signals playback by the label alone, not also by aria-pressed', () => {
    render(<FlyThrough messages={en} locale="en" />);
    expect(button('Play').hasAttribute('aria-pressed')).toBe(false);
    fireEvent.click(button('Play'));
    expect(button('Pause').hasAttribute('aria-pressed')).toBe(false);
  });

  it('announces the caption only while paused or stepping', () => {
    vi.useFakeTimers();
    render(<FlyThrough messages={en} locale="en" />);
    expect(caption().getAttribute('aria-live')).toBe('polite');
    fireEvent.click(button('Play'));
    expect(caption().getAttribute('aria-live')).toBe('off');
    for (let beat = 0; beat < 3; beat++) act(() => vi.advanceTimersByTime(BEAT_MS));
    expect(button('Play')).toBeTruthy();
    expect(caption().getAttribute('aria-live')).toBe('polite');
  });

  it('carries the C.1 ciphertext, not the plaintext, into out[16]', () => {
    render(<FlyThrough messages={en} locale="en" initialImpl="aesni" initialTarget="out" />);
    expect(screen.getByRole('radio', { name: 'Ciphertext → out[16]' })).toHaveProperty('checked', true);
    expect(caption().textContent).toContain('69 c4 e0');
    expect(token(0).textContent).toBe('69');
    expect(token(15).textContent).toBe('5a');
  });

  it('cross-fades the same beats under reduced motion', () => {
    mockReducedMotion(true);
    render(<FlyThrough messages={en} locale="en" />);
    expect(section().dataset['motion']).toBe('reduce');
    fireEvent.click(button('Step'));
    expect(section().dataset['beat']).toBe('register');
    expect(document.querySelector('.cv-fly__tokens--in')).not.toBeNull();
    expect(document.querySelector('.cv-fly__tokens--out')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('glides without fade layers when motion is allowed', () => {
    mockReducedMotion(false);
    render(<FlyThrough messages={en} locale="en" />);
    fireEvent.click(button('Step'));
    expect(section().dataset['motion']).toBe('full');
    expect(document.querySelectorAll('.cv-fly__tokens')).toHaveLength(1);
  });

  it.each([
    [en, 'en', 'Step', ['Step 1 of 3', 'Step 2 of 3', 'Step 3 of 3']],
    [de, 'de', 'Weiter', ['Schritt 1 von 3', 'Schritt 2 von 3', 'Schritt 3 von 3']],
  ] as const)('counts the same step in both languages (%#)', (messages, locale, stepLabel, counts) => {
    render(<FlyThrough messages={messages} locale={locale} />);
    const count = () => document.querySelector('.cv-fly__beat')!.textContent;
    expect(count()).toBe(counts[0]);
    fireEvent.click(button(stepLabel));
    expect(count()).toBe(counts[1]);
    fireEvent.click(button(stepLabel));
    expect(count()).toBe(counts[2]);
  });

  it('speaks German', () => {
    render(<FlyThrough messages={de} locale="de" initialImpl="aesni" initialTarget="out" />);
    expect(button('Weiter')).toBeTruthy();
    expect(caption().textContent).toContain('C.1-Geheimtext');
    expect(screen.getByRole('radio', { name: 'AES-NI' })).toHaveProperty('checked', true);
  });
});
