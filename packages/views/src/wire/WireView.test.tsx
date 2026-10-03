import type { Lens, Locale, WireFacet } from '@cryventure/core';
import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFixtureBundle, renderLab } from '@cryventure/viz/testing';
import { loadViewMessages } from '../messages.ts';
import WireView from './WireView.tsx';
import { wireBundle, wireCase, wireLabels, type WireCaseId } from './testFixture.ts';

const messagesIn = (locale: Locale) => ({ ...loadViewMessages(locale), ...wireLabels[locale] });

function render(id: WireCaseId, lens: Lens = 'engineer', locale: Locale = 'en', facet?: WireFacet) {
  const bundle = wireBundle(id);
  if (facet !== undefined) bundle.facets['wire@default'] = facet;
  return renderLab(<WireView labId="fixture" lens={lens} />, { bundle, messages: messagesIn(locale) });
}

const segment = (id: string) => document.querySelector<HTMLElement>(`[data-segment="${id}"]`)!;
const activeOffsets = () => [...document.querySelectorAll<HTMLElement>('.cv-wire__byte[data-active]')].map((byte) => Number(byte.dataset['offset']));
const lastStep = (id: WireCaseId) => wireCase(id).stepCount - 1;

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

  it('highlights the offsets active at the playhead (first, middle and last step)', () => {
    const { store } = render('cbc/repeated-blocks');
    expect(activeOffsets()).toEqual(Array.from({ length: 16 }, (_, i) => i));
    act(() => store.getState().seek(4));
    expect(activeOffsets()).toEqual(Array.from({ length: 16 }, (_, i) => 16 + i));
    expect(segment('c0').getAttribute('aria-label')).toMatch(/16 of them highlighted in this step$/);
    act(() => store.getState().seek(lastStep('cbc/repeated-blocks')));
    expect(activeOffsets()).toEqual(Array.from({ length: 16 }, (_, i) => 48 + i));
  });

  it('keeps a short final segment to its own length', () => {
    render('ctr/short-message');
    expect(segment('c1').querySelectorAll('.cv-wire__byte')).toHaveLength(4);
    expect(segment('nonce').dataset['role']).toBe('nonce');
  });

  it('shows hex in the engineer and cryptographer lenses, none in the story lens', () => {
    const { unmount } = render('ecb/repeated-blocks', 'cryptographer');
    expect(segment('c0').querySelector('.cv-wire__byte')?.textContent).toBe('54');
    expect(segment('c0').getAttribute('aria-label')).toContain('541ff0c9 2b9251ae 06c624c4 a8ab2a85');
    unmount();
    render('ecb/repeated-blocks', 'story');
    expect(segment('c0').querySelector('.cv-wire__byte')?.textContent).toBe('');
    expect(segment('c0').getAttribute('aria-label')).toBe('C1 (ciphertext): 16 bytes at offsets 0x00 to 0x0f');
  });

  it('speaks German', () => {
    render('cbc/repeated-blocks', 'engineer', 'de');
    expect(screen.getByRole('list', { name: 'Übertragene Bytes: 64 Byte in 4 Teilen' })).toBeTruthy();
    expect(segment('iv').getAttribute('aria-label')).toMatch(/^IV \(Initialisierungsvektor\): 16 Byte an den Offsets 0x00 bis 0x0f/);
  });

  it('renders a flip mask read-only', () => {
    const facet = wireCase('ecb/repeated-blocks').facet;
    const mask = '00'.repeat(47) + '01';
    render('ecb/repeated-blocks', 'engineer', 'en', { ...facet, flip: { param: 'flipHex', maskHex: mask } });
    const flipped = document.querySelectorAll<HTMLElement>('.cv-wire__byte[data-flipped]');
    expect([...flipped].map((byte) => byte.dataset['offset'])).toEqual(['47']);
    expect(flipped[0]?.textContent).toContain('↯');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(segment('c2').getAttribute('aria-label')).toMatch(/1 of them flipped$/);
  });

  it('explains when the wire facet is missing', () => {
    renderLab(<WireView labId="fixture" lens="engineer" />, { bundle: { ...createFixtureBundle(), facets: {} }, messages: messagesIn('en') });
    expect(screen.getByRole('status').textContent).toBe(messagesIn('en')['view.wire.missing']);
  });
});
