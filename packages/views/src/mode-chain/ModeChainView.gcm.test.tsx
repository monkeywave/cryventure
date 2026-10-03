import type { Lens, Locale } from '@cryventure/core';
import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderLab } from '@cryventure/viz/testing';
import { LabLayoutProvider, type BlockLabHrefBuilder } from '@cryventure/viz';
import { loadViewMessages } from '../messages.ts';
import ModeChainView from './ModeChainView.tsx';
import { gcmChainBundle, gcmChainCase, gcmChainLabels, type GcmChainCaseId } from './gcmFixture.ts';

const messagesIn = (locale: Locale) => ({ ...loadViewMessages(locale), ...gcmChainLabels[locale] });

function render(id: GcmChainCaseId = 'gcm/mcgrew-viega-tc4', { lens = 'engineer', locale = 'en', narrow = false, blockLabHref }: { lens?: Lens; locale?: Locale; narrow?: boolean; blockLabHref?: BlockLabHrefBuilder } = {}) {
  return renderLab(
    <LabLayoutProvider narrow={narrow}>
      <ModeChainView labId="fixture" lens={lens} />
    </LabLayoutProvider>,
    { bundle: gcmChainBundle(id), messages: messagesIn(locale), blockLabHref },
  );
}

const node = (id: string) => document.querySelector<HTMLElement>(`[data-node="${id}"]`)!;
const glyphOf = (id: string) => node(id).querySelector('.cv-chain__role-glyph')?.textContent;

describe('ModeChainView (GCM)', () => {
  it('styles tag, AAD, GHASH accumulator and length block by their own role and glyph', () => {
    render();
    expect(['tag.t', 'ghash.aad0', 'ghash.x1', 'ghash.length'].map((id) => node(id).dataset['role'])).toEqual(['tag', 'aad', 'hash', 'length']);
    expect(['tag.t', 'ghash.aad0', 'ghash.x1', 'ghash.length'].map(glyphOf)).toEqual(['✓', '◇✓', '⊗', '‖']);
  });

  it('leaves the CTR lanes unchanged: no role glyphs there', () => {
    render();
    expect(node('b0.output').dataset['role']).toBe('ciphertext');
    expect(glyphOf('b0.output')).toBeUndefined();
  });

  it('heads the GHASH lane as such and counts only the block lanes', () => {
    render();
    const lanes = [...document.querySelectorAll('.cv-chain__lane')].map((lane) => lane.textContent);
    expect(lanes).toEqual(['Start', 'Block 1', 'Block 2', 'Block 3', 'Block 4', 'GHASH and tag']);
    expect(screen.getByRole('group', { name: /^Dataflow of 4 blocks, one lane per block, plus the GHASH lane/ })).toBeTruthy();
  });

  it('says the GCM role in words and names GHASH-lane nodes by that lane', () => {
    const { store } = render();
    act(() => store.getState().seek(gcmChainCase('gcm/mcgrew-viega-tc4').stepCount - 1));
    expect(node('tag.t').getAttribute('aria-label')).toMatch(/^Tag T, GHASH lane: [0-9a-f ]+, authentication tag, computed in this step, from S = Y7 and E K\(J0\)$/);
    expect(node('ghash.aad0').getAttribute('aria-label')).toContain('additional authenticated data (AAD)');
    expect(node('ghash.x3').getAttribute('aria-label')).toMatch(/^Y3, GHASH lane: [0-9a-f ]+, GHASH accumulator: ⊕ the block, then multiply by H, from Y2 and C1 and H = E K\(0¹²⁸\)$/);
  });

  it('lists the GCM roles in the legend with their glyphs', () => {
    render();
    const legend = document.querySelector('.cv-chain__legend')!;
    expect([...legend.querySelectorAll('[data-role]')].map((entry) => entry.textContent)).toEqual([
      '◇✓additional authenticated data (AAD): authenticated, not encrypted',
      '⊗GHASH accumulator: ⊕ the block, then multiply by H',
      '‖length block: len(A) ‖ len(C) in bits',
      '✓authentication tag',
    ]);
  });

  it('zooms into setup and tag encryptions without a block number', () => {
    render('gcm/mcgrew-viega-tc4', { blockLabHref: (producer) => `/en/lab/${producer}/` });
    expect(node('h').querySelector('a')?.textContent).toBe('Zoom into this encryption');
    expect(node('tag.mask').querySelector('a')?.textContent).toBe('Zoom into this encryption');
    expect(node('b0.cipher').querySelector('a')?.textContent).toBe('Zoom into block 1');
  });

  it('marks the forged tag’s verify node as a tag and says it in German', () => {
    render('gcm/decrypt-forged', { locale: 'de' });
    expect(node('tag.verify').dataset['role']).toBe('tag');
    expect(node('tag.received').getAttribute('aria-label')).toContain('Authentifizierungs-Tag');
    expect(node('ghash.aad0').getAttribute('aria-label')).toContain('zusätzliche authentifizierte Daten (AAD)');
    expect([...document.querySelectorAll('.cv-chain__lane')].at(-1)?.textContent).toBe('GHASH und Tag');
  });

  it('scrolls inside the panel on a narrow lab (390px), never the page', () => {
    render('gcm/mcgrew-viega-tc4', { narrow: true });
    const canvas = document.querySelector<HTMLElement>('.cv-chain__canvas')!;
    expect(parseFloat(canvas.style.width)).toBeGreaterThan(390);
    expect(canvas.parentElement?.classList.contains('cv-chain__scroll')).toBe(true);
  });
});
