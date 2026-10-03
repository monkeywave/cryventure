import type { Lens, Locale, WireFacet } from '@cryventure/core';
import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFixtureBundle, installResizeObserverMock, renderLab } from '@cryventure/viz/testing';
import { loadViewMessages } from '../messages.ts';
import WireView from './WireView.tsx';
import { modeBundle, modeCase, modeLabels, type ModeCaseId } from '../testing/modeFixture.ts';

const messagesIn = (locale: Locale) => ({ ...loadViewMessages(locale), ...modeLabels[locale] });

function render(id: ModeCaseId, lens: Lens = 'engineer', locale: Locale = 'en', facet?: WireFacet) {
  const bundle = modeBundle(id);
  if (facet !== undefined) bundle.facets['wire@default'] = facet;
  return renderLab(<WireView labId="fixture" lens={lens} />, { bundle, messages: messagesIn(locale) });
}

const segment = (id: string) => document.querySelector<HTMLElement>(`[data-segment="${id}"]`)!;
/** What a screen reader reads for a segment: its visually hidden summary (the boxes are hidden). */
const summaryOf = (id: string) => segment(id).querySelector('.cv-visually-hidden')?.textContent ?? '';
const activeOffsets = () => [...document.querySelectorAll<HTMLElement>('.cv-wire__byte[data-active]')].map((byte) => Number(byte.dataset['offset']));
const lastStep = (id: ModeCaseId) => modeCase(id).stepCount - 1;

describe('WireView', () => {
  it('groups the bytes by segment with role, label and offsets ruler', () => {
    render('cbc/repeated-blocks');
    expect(screen.getByRole('list', { name: 'Bytes as they travel: 64 bytes in 4 parts' })).toBeTruthy();
    expect(segment('iv').dataset['role']).toBe('iv');
    expect(segment('iv').querySelector('.cv-wire__glyph')?.textContent).toBe('⚄');
    expect(segment('c0').querySelector('.cv-wire__label')?.textContent).toBe('C1');
    expect(segment('c0').querySelector('.cv-wire__range')?.textContent).toBe('16 bytes · 0x10–0x1f');
    expect(segment('c0').querySelector('.cv-wire__offset')?.textContent).toBe('0x10');
    expect(segment('c0').querySelectorAll('.cv-wire__byte')).toHaveLength(16);
  });

  it('reads each segment as text in browse mode, not as an aria-label over hidden content', () => {
    render('cbc/repeated-blocks');
    expect(segment('iv').hasAttribute('aria-label')).toBe(false);
    expect(summaryOf('iv')).toMatch(/^IV \(initialization vector\): 16 bytes at offsets 0x00 to 0x0f/);
  });

  it('wraps rows to the width of the panel (16, 8 or 4 bytes per row)', () => {
    const resizeObserver = installResizeObserverMock();
    try {
      render('cbc/repeated-blocks');
      const rowLengths = () => [...segment('c0').querySelectorAll('.cv-wire__row')].map((row) => row.querySelectorAll('.cv-wire__byte').length);
      expect(rowLengths()).toEqual([16]);
      const strip = screen.getByRole('list');
      act(() => resizeObserver.resize(strip, 200));
      expect(rowLengths()).toEqual([4, 4, 4, 4]);
      expect([...segment('c0').querySelectorAll('.cv-wire__offset')].map((offset) => offset.textContent)).toEqual(['0x10', '0x14', '0x18', '0x1c']);
      act(() => resizeObserver.resize(strip, 300));
      expect(rowLengths()).toEqual([8, 8]);
    } finally {
      resizeObserver.restore();
    }
  });

  it('uses singular forms for one part and one byte', () => {
    const facet = modeCase('ctr/short-message').wire;
    const one = { ...facet, segments: facet.segments.slice(0, 1), activeAt: [{ step: -1, offsets: [0] }] };
    render('ctr/short-message', 'engineer', 'en', one);
    expect(screen.getByRole('list', { name: 'Bytes as they travel: 16 bytes in 1 part' })).toBeTruthy();
    expect(summaryOf('nonce')).toMatch(/; 1 of them highlighted in this step$/);
  });

  it('uses singular forms in German', () => {
    const facet = modeCase('ctr/short-message').wire;
    const one = { ...facet, segments: facet.segments.slice(0, 1), activeAt: [{ step: -1, offsets: [0] }], flip: { param: 'm', maskHex: '01' } };
    render('ctr/short-message', 'engineer', 'de', one);
    expect(screen.getByRole('list', { name: 'Übertragene Bytes: 16 Byte in 1 Teil' })).toBeTruthy();
    expect(summaryOf('nonce')).toMatch(/; 1 davon ist in diesem Schritt hervorgehoben; 1 davon ist gekippt$/);
    expect(screen.getByRole('region', { name: 'Übertragene Bytes' })).toBeTruthy();
  });

  it('highlights the offsets active at the playhead (first, middle and last step)', () => {
    const { store } = render('cbc/repeated-blocks');
    expect(activeOffsets()).toEqual(Array.from({ length: 16 }, (_, i) => i));
    act(() => store.getState().seek(4));
    expect(activeOffsets()).toEqual(Array.from({ length: 16 }, (_, i) => 16 + i));
    expect(summaryOf('c0')).toMatch(/16 of them highlighted in this step$/);
    act(() => store.getState().seek(lastStep('cbc/repeated-blocks')));
    expect(activeOffsets()).toEqual(Array.from({ length: 16 }, (_, i) => 48 + i));
  });

  it('keeps a short final segment to its own length', () => {
    render('ctr/short-message');
    expect(segment('c1').querySelectorAll('.cv-wire__byte')).toHaveLength(4);
    expect(segment('nonce').dataset['role']).toBe('nonce');
  });

  it('shows hex in the engineer and cryptographer lenses, none in the story lens', () => {
    const { store, unmount } = render('ecb/repeated-blocks', 'cryptographer');
    act(() => store.getState().seek(lastStep('ecb/repeated-blocks')));
    expect(segment('c0').querySelector('.cv-wire__byte')?.textContent).toBe('54');
    expect(summaryOf('c0')).toContain('541ff0c9 2b9251ae 06c624c4 a8ab2a85');
    unmount();
    const story = render('ecb/repeated-blocks', 'story');
    act(() => story.store.getState().seek(lastStep('ecb/repeated-blocks')));
    expect(segment('c0').querySelector('.cv-wire__byte')?.textContent).toBe('');
    expect(summaryOf('c0')).toBe('C1 (ciphertext): 16 bytes at offsets 0x00 to 0x0f');
  });

  it('speaks German', () => {
    render('cbc/repeated-blocks', 'engineer', 'de');
    expect(screen.getByRole('list', { name: 'Übertragene Bytes: 64 Byte in 4 Teilen' })).toBeTruthy();
    expect(summaryOf('iv')).toMatch(/^IV \(Initialisierungsvektor\): 16 Byte an den Offsets 0x00 bis 0x0f/);
  });

  it('renders a flip mask read-only', () => {
    const facet = modeCase('ecb/repeated-blocks').wire;
    const mask = '00'.repeat(47) + '01';
    const { store } = render('ecb/repeated-blocks', 'engineer', 'en', { ...facet, flip: { param: 'flipHex', maskHex: mask } });
    act(() => store.getState().seek(lastStep('ecb/repeated-blocks')));
    const flipped = document.querySelectorAll<HTMLElement>('.cv-wire__byte[data-flipped]');
    expect([...flipped].map((byte) => byte.dataset['offset'])).toEqual(['47']);
    expect(flipped[0]?.textContent).toContain('↯');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(summaryOf('c2')).toMatch(/1 of them flipped$/);
  });

  it('dims, dashes and withholds the blocks not sent yet, then reveals each at its emit step', () => {
    const { store } = render('cbc/repeated-blocks');
    const bytesOf = (id: string) => [...segment(id).querySelectorAll('.cv-wire__byte')].map((byte) => byte.textContent);
    expect(segment('iv').dataset['pending']).toBeUndefined();
    expect(segment('c0').dataset['pending']).toBe('');
    expect(bytesOf('c0')).toEqual(Array.from({ length: 16 }, () => '··'));
    expect(summaryOf('c0')).toBe('C1 (ciphertext): 16 bytes at offsets 0x10 to 0x1f; not sent yet');
    expect(screen.getByText('dashed ··: not sent yet')).toBeTruthy();
    act(() => store.getState().seek(2));
    expect(segment('c0').dataset['pending']).toBe('');
    act(() => store.getState().seek(3));
    expect(segment('c0').dataset['pending']).toBeUndefined();
    expect(bytesOf('c0')).not.toContain('··');
    expect(summaryOf('c0')).not.toContain('not sent yet');
    expect(segment('c1').dataset['pending']).toBe('');
    act(() => store.getState().seek(lastStep('cbc/repeated-blocks')));
    expect(document.querySelectorAll('.cv-wire__segment[data-pending]')).toHaveLength(0);
  });

  it('shows received ciphertext from the start when decrypting', () => {
    render('ecb/repeated-blocks-decrypt');
    expect(document.querySelectorAll('.cv-wire__segment[data-pending]')).toHaveLength(0);
    expect(screen.queryByText('dashed ··: not sent yet')).toBeNull();
  });

  it('says “not sent yet” in German', () => {
    render('ctr/short-message', 'engineer', 'de');
    expect(summaryOf('c1')).toMatch(/; noch nicht gesendet$/);
    expect(screen.getByText('gestrichelt ··: noch nicht gesendet')).toBeTruthy();
  });

  it('explains when the wire facet is missing', () => {
    renderLab(<WireView labId="fixture" lens="engineer" />, { bundle: { ...createFixtureBundle(), facets: {} }, messages: messagesIn('en') });
    expect(screen.getByRole('status').textContent).toBe(messagesIn('en')['view.wire.missing']);
  });
});
