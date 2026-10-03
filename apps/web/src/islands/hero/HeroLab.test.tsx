// @vitest-environment jsdom
import '@cryventure/viz/testing/setup';
import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderLab } from '@cryventure/viz/testing';
import hero from '../../i18n/en/hero.json' with { type: 'json' };
import heroDe from '../../i18n/de/hero.json' with { type: 'json' };
import uiEn from '../../i18n/en/ui.json' with { type: 'json' };
import { TEXT_EDIT_DEBOUNCE_MS } from '../lab/ParamPanel.tsx';
import { HeroTextField } from './HeroLab.tsx';
import { FIPS_C1_KEY_HEX } from './heroText.ts';

const C1_PARAMS = { keyHex: FIPS_C1_KEY_HEX, plaintextHex: '00112233445566778899aabbccddeeff', detail: 'op' };

function renderField(messages: Record<string, string> = hero, params: Record<string, unknown> = C1_PARAMS) {
  const onRequestParams = vi.fn();
  let setParams: (next: Record<string, unknown>) => void = () => undefined;
  function Harness() {
    const [current, set] = useState(params);
    setParams = (next) => act(() => set(next));
    return <HeroTextField params={current} />;
  }
  renderLab(<Harness />, { messages: { ...uiEn, ...messages }, onRequestParams });
  return { onRequestParams, setParams, input: screen.getByLabelText(messages['ui.hero.textLabel']!) as HTMLInputElement };
}

const blockText = () => Array.from(document.querySelectorAll('.cv-hero-text__byte'), (cell) => cell.firstChild?.textContent).join('');

const note = () => screen.getByTestId('hero-padding-note').textContent;
const paddingCells = () => document.querySelectorAll('[data-padding]');

afterEach(() => vi.useRealTimers());

describe('HeroTextField', () => {
  it('starts with the C.1 example, no padding marks, and the read-only C.1 key', () => {
    renderField();
    expect(note()).toContain('FIPS 197, App. C.1');
    expect(paddingCells()).toHaveLength(0);
    expect(screen.getByText('00112233445566778899aabbccddeeff'.slice(0, 2))).toBeTruthy();
    const key = screen.getByLabelText(hero['ui.hero.keyLabel']) as HTMLInputElement;
    expect(key.value).toBe(FIPS_C1_KEY_HEX);
    expect(key.readOnly).toBe(true);
  });

  it('maps typed text to a zero-padded plaintextHex (debounced) and marks the padding', () => {
    vi.useFakeTimers();
    const { onRequestParams, input } = renderField();
    fireEvent.change(input, { target: { value: 'Hi' } });
    expect(onRequestParams).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(TEXT_EDIT_DEBOUNCE_MS));
    expect(onRequestParams).toHaveBeenCalledWith({ plaintextHex: '48690000000000000000000000000000' });
    expect(note()).toBe('+ 14 zero bytes of padding (marked) fill the block to 16 bytes.');
    expect(paddingCells()).toHaveLength(14);
    expect(screen.getByText('2 / 16 bytes (UTF-8)')).toBeTruthy();
  });

  it('clamps to 16 UTF-8 bytes', () => {
    const { input } = renderField();
    fireEvent.change(input, { target: { value: '0123456789abcdefOVERFLOW' } });
    expect(input.value).toBe('0123456789abcdef');
    expect(note()).toBe(hero['ui.hero.noPadding']);
    expect(paddingCells()).toHaveLength(0);
  });

  it('uses the singular for one padding byte, in German too', () => {
    const { input } = renderField(heroDe);
    fireEvent.change(input, { target: { value: '0123456789abcde' } });
    expect(note()).toBe('+ 1 Nullbyte Padding (markiert) füllt den Block auf 16 Byte auf.');
  });

  it('uses the German plural for several padding bytes', () => {
    const { input } = renderField(heroDe);
    fireEvent.change(input, { target: { value: '0123456789abcd' } });
    expect(note()).toBe('+ 2 Nullbytes Padding (markiert) füllen den Block auf 16 Byte auf.');
  });

  it('labels a non-C.1 key as custom', () => {
    renderField(hero, { ...C1_PARAMS, keyHex: '2b7e151628aed2a6abf7158809cf4f3c' });
    expect(screen.getByLabelText(hero['ui.hero.keyLabelCustom'])).toBeTruthy();
  });

  it('follows params changed elsewhere (e.g. Apply in the Inputs panel): clears the text and drops a pending request', () => {
    vi.useFakeTimers();
    const { onRequestParams, setParams, input } = renderField();
    fireEvent.change(input, { target: { value: 'Hi' } });
    const applied = { ...C1_PARAMS, plaintextHex: 'ffeeddccbbaa99887766554433221100' };
    setParams(applied);
    act(() => vi.advanceTimersByTime(TEXT_EDIT_DEBOUNCE_MS));
    expect(onRequestParams).not.toHaveBeenCalled();
    expect(input.value).toBe('');
    expect(blockText()).toBe(applied.plaintextHex);
    expect(paddingCells()).toHaveLength(0);
  });

  it('keeps the typed text once the lab applied its block', () => {
    vi.useFakeTimers();
    const { onRequestParams, setParams, input } = renderField();
    fireEvent.change(input, { target: { value: 'Hi' } });
    act(() => vi.advanceTimersByTime(TEXT_EDIT_DEBOUNCE_MS));
    setParams({ ...C1_PARAMS, plaintextHex: '48690000000000000000000000000000' });
    expect(onRequestParams).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('Hi');
    expect(paddingCells()).toHaveLength(14);
  });

  it('does not announce the byte counter on every keystroke; it describes the input instead', () => {
    const { input } = renderField();
    const counter = screen.getByText('0 / 16 bytes (UTF-8)');
    expect(counter.closest('[aria-live]')).toBeNull();
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(counter.id);
  });

  it('marks padding bytes with visually-hidden text, not only a title', () => {
    const { input } = renderField(heroDe);
    fireEvent.change(input, { target: { value: 'Hi' } });
    const pad = paddingCells()[0]!;
    expect(pad.querySelector('.sr-only')?.textContent).toBe(heroDe['ui.hero.paddingByte']);
  });
});
