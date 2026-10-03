import type { Lens, Locale } from '@cryventure/core';
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFixtureBundle, renderLab } from '@cryventure/viz/testing';
import { LabLayoutProvider, type LabHrefBuilder } from '@cryventure/viz';
import { loadViewMessages } from '../messages.ts';
import ModeChainView from './ModeChainView.tsx';
import { chainBundle, chainCase, chainLabels, type ChainCaseId } from './testFixture.ts';

const messagesIn = (locale: Locale) => ({ ...loadViewMessages(locale), ...chainLabels[locale] });

interface RenderOptions {
  lens?: Lens;
  locale?: Locale;
  labHref?: LabHrefBuilder;
  narrow?: boolean;
}

function render(id: ChainCaseId, { lens = 'engineer', locale = 'en', labHref, narrow = false }: RenderOptions = {}) {
  return renderLab(
    <LabLayoutProvider narrow={narrow}>
      <ModeChainView labId="fixture" lens={lens} />
    </LabLayoutProvider>,
    { bundle: chainBundle(id), messages: messagesIn(locale), labHref },
  );
}

const node = (id: string) => document.querySelector<HTMLElement>(`[data-node="${id}"]`)!;
const statusOf = (id: string) => node(id).dataset['status'];
const lastStep = (id: ChainCaseId) => chainCase(id).stepCount - 1;
const zoomHref: LabHrefBuilder = (producerId, params) => `/en/lab/${producerId}/#p=${(params as { plaintextHex: string }).plaintextHex}`;

describe('ModeChainView', () => {
  it('lays out one lane per block, the IV and padding lane first', () => {
    render('cbc/repeated-blocks');
    const lanes = [...document.querySelectorAll('.cv-chain__lane')].map((lane) => lane.textContent);
    expect(lanes).toEqual(['Start', 'Block 1', 'Block 2', 'Block 3']);
    expect(node('iv').style.left).toBe('12px');
    // Stages top → bottom: input above ⊕ above E_K above output.
    const tops = ['b0.input', 'b0.xor', 'b0.cipher', 'b0.output'].map((id) => parseFloat(node(id).style.top));
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
  });

  it('follows the playhead: pending, current (with ▸ and aria-current) and done nodes', () => {
    const { store } = render('cbc/repeated-blocks');
    expect(statusOf('b0.input')).toBe('active');
    expect(statusOf('b0.xor')).toBe('pending');
    expect(node('b0.xor').getAttribute('aria-label')).toBe('⊕, block 1: not computed yet');
    act(() => store.getState().seek(1));
    expect(statusOf('b0.xor')).toBe('current');
    expect(node('b0.xor').getAttribute('aria-current')).toBe('step');
    expect(node('b0.xor').textContent).toContain('▸');
    expect(statusOf('b0.cipher')).toBe('pending');
    act(() => store.getState().seek(lastStep('cbc/repeated-blocks')));
    expect(statusOf('b0.xor')).toBe('active');
    expect(document.querySelectorAll('[data-node][data-status="pending"]')).toHaveLength(0);
    expect(document.querySelectorAll('.cv-chain__edge[data-status="pending"]')).toHaveLength(0);
  });

  it('marks edges pending until their target gets its value', () => {
    const { store } = render('ecb/repeated-blocks');
    const edge = () => document.querySelector<SVGPathElement>('[data-edge="b0.input->b0.cipher"]')!;
    expect(edge().dataset['status']).toBe('pending');
    act(() => store.getState().seek(1));
    expect(edge().dataset['status']).toBe('current');
    act(() => store.getState().seek(2));
    expect(edge().dataset['status']).toBe('active');
  });

  it('shows labels only in the story lens', () => {
    render('ecb/repeated-blocks', { lens: 'story' });
    expect(document.querySelector('.cv-chain__hex')).toBeNull();
    expect(document.querySelector('.cv-chain__formula')).toBeNull();
    expect(node('b0.input').getAttribute('aria-label')).toBe('P1, block 1, same value as P2');
    expect(document.body.textContent).not.toMatch(/41545441/);
  });

  it('shows hex in the engineer lens, two lines of 8 bytes per block', () => {
    render('ecb/repeated-blocks');
    const lines = [...node('b0.input').querySelectorAll('.cv-chain__hex > span')].map((line) => line.textContent);
    expect(lines).toEqual(['41545441434b2041', '54204441574e2121']);
    expect(node('b0.input').getAttribute('aria-label')).toBe('P1, block 1: 41545441 434b2041 54204441 574e2121, same value as P2');
    expect(document.querySelector('.cv-chain__formula')).toBeNull();
  });

  it('abbreviates hex in compact widths and shows the full value of the focused node', () => {
    render('ecb/repeated-blocks', { narrow: true });
    expect(node('b0.input').querySelector('.cv-chain__hex')?.textContent).toBe('4154…2121');
    expect(node('b0.input').title).toBe('P1: 41545441 434b2041 54204441 574e2121');
    act(() => node('b0.input').focus());
    expect(document.querySelector('.cv-chain__readout code')?.textContent).toBe('41545441 434b2041 54204441 574e2121');
  });

  it('withholds a pending value from the readout', () => {
    render('ecb/repeated-blocks');
    act(() => node('b0.output').focus());
    expect(document.querySelector('.cv-chain__readout')?.textContent).toBe('C1 not computed yet');
  });

  it('adds the formula and subscripted labels in the cryptographer lens', () => {
    render('cbc/repeated-blocks', { lens: 'cryptographer' });
    expect(document.querySelector('.cv-chain__formula')?.textContent).toBe('Cᵢ = EK(Pᵢ ⊕ Cᵢ₋₁), C₀ = IV');
    expect(document.querySelector('.cv-chain__formula sub')?.textContent).toBe('K');
    expect(node('b1.output').querySelector('sub')?.textContent).toBe('2');
    expect(node('b0.cipher').querySelector('sub')?.textContent).toBe('K');
  });

  it('renders German labels and descriptions', () => {
    render('ctr/short-message', { locale: 'de' });
    expect(screen.getByRole('group', { name: /^Datenfluss von 2 Blöcken/ })).toBeTruthy();
    expect(node('b0.keystream').getAttribute('aria-label')).toMatch(/^Schlüsselstrom 1, Block 1: noch nicht berechnet$/);
    expect(document.querySelector('.cv-chain__legend')?.textContent).toContain('gestrichelt');
  });

  it('marks equal ECB ciphertext blocks with a shared ≡ letter once they exist', () => {
    const { store } = render('ecb/repeated-blocks');
    expect(node('b0.output').dataset['same']).toBeUndefined();
    expect(node('b0.input').dataset['same']).toBe('0');
    expect(node('b1.input').dataset['same']).toBe('0');
    act(() => store.getState().seek(lastStep('ecb/repeated-blocks')));
    expect(node('b0.output').dataset['same']).toBe('1');
    expect(node('b1.output').dataset['same']).toBe('1');
    expect(node('b2.output').dataset['same']).toBeUndefined();
    expect(node('b1.output').querySelector('.cv-chain__same')?.textContent).toBe('≡B');
    expect(node('b1.output').getAttribute('aria-label')).toMatch(/same value as C1$/);
    expect(document.querySelector('.cv-chain__legend [data-same]')).not.toBeNull();
  });

  it('shows no repetition in CBC ciphertext even for equal plaintext blocks', () => {
    const { store } = render('cbc/repeated-blocks');
    act(() => store.getState().seek(lastStep('cbc/repeated-blocks')));
    expect(node('b0.input').dataset['same']).toBe('0');
    expect(node('b0.output').dataset['same']).toBeUndefined();
    expect(node('b1.output').dataset['same']).toBeUndefined();
  });

  it('links each encrypting cipher node into the block cipher lab when the host builds links', () => {
    render('ecb/repeated-blocks', { labHref: zoomHref });
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Zoom into block 1', 'Zoom into block 2', 'Zoom into block 3']);
    expect(links[0]?.getAttribute('href')).toBe('/en/lab/aes/#p=41545441434b204154204441574e2121');
    expect(links[0]?.getAttribute('target')).toBeNull();
  });

  it('shows no zoom link without a host link builder', () => {
    render('ecb/repeated-blocks');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('shows no zoom link for decryption (the AES lab encrypts)', () => {
    render('ecb/repeated-blocks-decrypt', { labHref: zoomHref });
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('moves a roving focus with the arrow keys without stepping the player', () => {
    const { store } = render('cbc/repeated-blocks');
    const tabbable = () => [...document.querySelectorAll('[data-node][tabindex="0"]')].map((element) => element.getAttribute('data-node'));
    expect(tabbable()).toEqual(['pad']);
    act(() => node('iv').focus());
    fireEvent.keyDown(node('iv'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(node('b0.xor'));
    fireEvent.keyDown(node('b0.xor'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(node('b0.cipher'));
    fireEvent.keyDown(node('b0.cipher'), { key: 'End' });
    expect(tabbable()).toHaveLength(1);
    expect(store.getState().step).toBe(-1);
  });

  it('explains when the chain facet is missing', () => {
    renderLab(<ModeChainView labId="fixture" lens="engineer" />, { bundle: { ...createFixtureBundle(), facets: {} }, messages: messagesIn('en') });
    expect(screen.getByRole('status').textContent).toBe(messagesIn('en')['view.mode-chain.missing']);
  });
});
