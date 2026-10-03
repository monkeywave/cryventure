import type { Locale } from '@cryventure/core';
import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderLab } from '@cryventure/viz/testing';
import { loadViewMessages } from '../messages.ts';
import WireView from './WireView.tsx';
import { gcmWireBundle, gcmWireCase, gcmWireLabels, type GcmWireCaseId } from './gcmFixture.ts';
import { ROLE_GLYPHS } from '../_lib/roleGlyphs.ts';

const messagesIn = (locale: Locale) => ({ ...loadViewMessages(locale), ...gcmWireLabels[locale] });

function render(id: GcmWireCaseId = 'gcm/mcgrew-viega-tc4', locale: Locale = 'en') {
  return renderLab(<WireView labId="fixture" lens="engineer" />, { bundle: gcmWireBundle(id), messages: messagesIn(locale) });
}

const segment = (id: string) => document.querySelector<HTMLElement>(`[data-segment="${id}"]`)!;
const summaryOf = (id: string) => segment(id).querySelector('.cv-visually-hidden')?.textContent ?? '';
const glyphOf = (id: string) => segment(id).querySelector('.cv-wire__glyph')?.textContent;

describe('WireView (GCM)', () => {
  it('gives AAD and the tag their own role, glyph and words', () => {
    render();
    expect(segment('aad').dataset['role']).toBe('aad');
    expect(glyphOf('aad')).toBe('◇✓');
    expect(glyphOf('tag')).toBe('✓');
    expect(summaryOf('aad')).toMatch(/^AAD \(not encrypted\) \(additional authenticated data \(AAD\)\): 20 bytes/);
    expect(summaryOf('tag')).toMatch(/^Tag \(authentication tag\): 16 bytes/);
  });

  it('sends the tag only once it is computed when encrypting', () => {
    const { store } = render();
    expect(segment('tag').hasAttribute('data-pending')).toBe(true);
    act(() => store.getState().seek(gcmWireCase('gcm/mcgrew-viega-tc4').stepCount - 1));
    expect(segment('tag').hasAttribute('data-pending')).toBe(false);
  });

  it('says the GCM roles in German', () => {
    render('gcm/decrypt-forged', 'de');
    expect(summaryOf('aad')).toContain('zusätzliche authentifizierte Daten (AAD)');
    expect(summaryOf('tag')).toContain('Authentifizierungs-Tag');
  });

  it('keeps the classic glyphs', () => {
    expect([ROLE_GLYPHS.iv, ROLE_GLYPHS.ciphertext, ROLE_GLYPHS.plaintext, ROLE_GLYPHS.padding]).toEqual(['⚄', '◆', '◇', '░']);
  });
});
