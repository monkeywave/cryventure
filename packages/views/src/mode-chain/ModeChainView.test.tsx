import type { Lens, Locale } from '@cryventure/core';
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createFixtureBundle, renderLab } from '@cryventure/viz/testing';
import { LabLayoutProvider, type BlockLabHrefBuilder } from '@cryventure/viz';
import { loadViewMessages } from '../messages.ts';
import ModeChainView from './ModeChainView.tsx';
import { modeBundle, modeCase, modeLabels, type ModeCaseId } from '../testing/modeFixture.ts';

const messagesIn = (locale: Locale) => ({ ...loadViewMessages(locale), ...modeLabels[locale] });

interface RenderOptions {
  lens?: Lens;
  locale?: Locale;
  blockLabHref?: BlockLabHrefBuilder;
  narrow?: boolean;
}

function render(id: ModeCaseId, { lens = 'engineer', locale = 'en', blockLabHref, narrow = false }: RenderOptions = {}) {
  return renderLab(
    <LabLayoutProvider narrow={narrow}>
      <ModeChainView labId="fixture" lens={lens} />
    </LabLayoutProvider>,
    { bundle: modeBundle(id), messages: messagesIn(locale), blockLabHref },
  );
}

const node = (id: string) => document.querySelector<HTMLElement>(`[data-node="${id}"]`)!;
const statusOf = (id: string) => node(id).dataset['status'];
const lastStep = (id: ModeCaseId) => modeCase(id).stepCount - 1;
const zoomHref: BlockLabHrefBuilder = (producerId, _keyHex, blockHex) => `/en/lab/${producerId}/#p=${blockHex}`;

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

  it('follows the playhead: pending, current (with ▸, said in words) and done nodes', () => {
    const { store } = render('cbc/repeated-blocks');
    expect(statusOf('b0.input')).toBe('active');
    expect(statusOf('b0.xor')).toBe('pending');
    expect(node('b0.xor').getAttribute('aria-label')).toBe('⊕, block 1: not computed yet, from P1 and IV');
    act(() => store.getState().seek(1));
    expect(statusOf('b0.xor')).toBe('current');
    expect(node('b0.xor').getAttribute('aria-label')).toContain('computed in this step');
    expect(node('b0.xor').textContent).toContain('▸');
    expect(statusOf('b0.cipher')).toBe('pending');
    act(() => store.getState().seek(lastStep('cbc/repeated-blocks')));
    expect(statusOf('b0.xor')).toBe('active');
    expect(document.querySelectorAll('[data-node][data-status="pending"]')).toHaveLength(0);
    expect(document.querySelectorAll('.cv-chain__edge[data-status="pending"]')).toHaveLength(0);
  });

  it('never marks several nodes as aria-current', () => {
    const { store } = render('ctr/short-message');
    act(() => store.getState().seek(1));
    expect(document.querySelectorAll('[data-status="current"]').length).toBeGreaterThan(1);
    expect(document.querySelectorAll('[aria-current]')).toHaveLength(0);
  });

  it('says where each node takes its inputs from (the edges are hidden from screen readers)', () => {
    render('cbc/repeated-blocks');
    expect(node('b1.xor').getAttribute('aria-label')).toBe('⊕, block 2: not computed yet, from P2 and C1');
    expect(node('b0.cipher').getAttribute('aria-label')).toMatch(/, from ⊕, block 1$/);
    expect(node('iv').getAttribute('aria-label')).not.toContain('from');
  });

  it('says where inputs come from in German', () => {
    render('cbc/repeated-blocks', { locale: 'de' });
    expect(node('b1.xor').getAttribute('aria-label')).toMatch(/, von P2 und C1$/);
  });

  it('describes a single-block diagram in the singular', () => {
    const facet = modeCase('ecb/repeated-blocks').chain;
    const one = { ...facet, nodes: facet.nodes.filter((n) => n.block === 0), edges: facet.edges.filter((e) => e.to.startsWith('b0.')) };
    const bundle = modeBundle('ecb/repeated-blocks');
    bundle.facets['chain@default'] = one;
    renderLab(<ModeChainView labId="fixture" lens="engineer" />, { bundle, messages: messagesIn('en') });
    expect(screen.getByRole('group', { name: /^Dataflow of 1 block, one lane per block\./ })).toBeTruthy();
  });

  it('describes a single-block diagram in German', () => {
    const facet = modeCase('ecb/repeated-blocks').chain;
    const one = { ...facet, nodes: facet.nodes.filter((n) => n.block === 0), edges: facet.edges.filter((e) => e.to.startsWith('b0.')) };
    const bundle = modeBundle('ecb/repeated-blocks');
    bundle.facets['chain@default'] = one;
    renderLab(<ModeChainView labId="fixture" lens="engineer" />, { bundle, messages: messagesIn('de') });
    expect(screen.getByRole('group', { name: /^Datenfluss eines Blocks, eine Spur pro Block\./ })).toBeTruthy();
  });

  it('scrolls the lane computed in this step to the middle of the scroller, not the page', () => {
    const scrollTo = vi.fn();
    const { store } = render('ecb/repeated-blocks');
    const scroller = document.querySelector<HTMLElement>('.cv-chain__scroll')!;
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 200 });
    Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: 1000 });
    scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo;
    act(() => store.getState().seek(5));
    const box = node('b2.cipher');
    const middle = parseFloat(box.style.left) + parseFloat(box.style.width) / 2;
    expect(scrollTo).toHaveBeenLastCalledWith({ left: Math.max(0, middle - 100), behavior: 'smooth' });
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
    expect(node('b0.keystream').getAttribute('aria-label')).toBe('Schlüsselstrom 1, Block 1: noch nicht berechnet, von E K, Block 1');
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
    expect(node('b1.output').getAttribute('aria-label')).toMatch(/same value as C1, from E K, block 2$/);
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
    render('ecb/repeated-blocks', { blockLabHref: zoomHref });
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Zoom into block 1', 'Zoom into block 2', 'Zoom into block 3']);
    expect(links[0]?.getAttribute('href')).toBe('/en/lab/aes/#p=41545441434b204154204441574e2121');
    expect(links[0]?.getAttribute('target')).toBeNull();
  });

  it('keeps zoom links out of the tab order unless their node holds the roving focus', () => {
    render('ecb/repeated-blocks', { blockLabHref: zoomHref });
    const tabIndices = () => screen.getAllByRole('link').map((link) => link.tabIndex);
    expect(tabIndices()).toEqual([-1, -1, -1]);
    act(() => node('b1.cipher').focus());
    expect(tabIndices()).toEqual([-1, 0, -1]);
  });

  it('follows the zoom link with Enter on its cipher node', () => {
    render('ecb/repeated-blocks', { blockLabHref: zoomHref });
    const link = screen.getAllByRole('link')[1]!;
    const click = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener('click', click);
    act(() => node('b1.cipher').focus());
    fireEvent.keyDown(node('b1.cipher'), { key: 'Enter' });
    expect(click).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(node('b1.input'), { key: 'Enter' });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('shows no zoom link without a host link builder', () => {
    render('ecb/repeated-blocks');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('shows no zoom link for decryption (the AES lab encrypts)', () => {
    render('ecb/repeated-blocks-decrypt', { blockLabHref: zoomHref });
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
