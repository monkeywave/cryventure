import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profiler } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createLabStore } from '@cryventure/viz';
import { renderLab } from '@cryventure/viz/testing';
import { loadVizMessages } from '@cryventure/viz/messages';
import { loadViewMessages } from '../messages.ts';
import DerivationView from './DerivationView.tsx';
import type { DerivationFacet, DerivationNode, LabZoom, TraceBundle } from '@cryventure/core';
import { aesDerivation, derivationLabels, aesDerivationBundle } from './testFixture.ts';

const view = <DerivationView labId="fixture" lens="engineer" />;

function renderEnglish() {
  return renderLab(view, {
    bundle: aesDerivationBundle(),
    messages: { ...loadViewMessages('en'), ...derivationLabels.en },
  });
}

const live = () => document.querySelector('[aria-live="polite"]') as HTMLElement;
const word = (hex: string) => screen.getByRole('button', { name: new RegExp(`${hex}$`) });
const chain = () => document.querySelector<HTMLElement>('.cv-derivation__chain');
const roundItem = (round: number) =>
  document.querySelectorAll('.cv-derivation__row')[round] as HTMLElement;
const sources = () =>
  [...document.querySelectorAll('[data-source]')]
    .map((node) => node.getAttribute('data-node'))
    .sort();

/** `bundle` with its derivation facet replaced (a re-run of the lab with new params). */
function withDerivation(derivation: DerivationFacet): TraceBundle {
  const bundle = aesDerivationBundle();
  return { ...bundle, facets: { ...bundle.facets, 'derivation@default': derivation } };
}

/**
 * Test-only stand-in for an AES-256 schedule: the AES-128 nodes plus result words w[44..59] in round
 * keys 11..14 (ids are path-derived, so w[50] exists only here). Values are irrelevant to selection.
 */
function longerDerivation(): DerivationFacet {
  const extra: DerivationNode[] = Array.from({ length: 16 }, (_, k) => {
    const i = 44 + k;
    const group = Math.floor(i / 4);
    return {
      id: `w/${i}`,
      label: { key: 'plugin.aes.derivation.word', params: { i } },
      bytes: [i, 0, 0, 0],
      op: 'xor',
      inputs: [`w/${i - 1}`, `w/${i - 8}`],
      group,
      result: true,
      valueRef: `${group}/roundKey`,
    };
  });
  const groups = Array.from({ length: 15 }, (_, n) => ({ id: n, label: { key: 'plugin.aes.derivation.roundKey', params: { n } } }));
  return { ...aesDerivation, nodes: [...aesDerivation.nodes, ...extra], groups };
}

/** Same key size, different key: every word id survives, the bytes change. */
function sameShapeDerivation(): DerivationFacet {
  return { ...aesDerivation, nodes: aesDerivation.nodes.map((node) => ({ ...node, bytes: node.bytes.map((byte) => byte ^ 0xff) })) };
}

const nodeButton = (id: string) => document.querySelector<HTMLElement>(`[data-node="${id}"]`)!;

describe('DerivationView selection across a new derivation facet', () => {
  const render = (derivation: DerivationFacet) =>
    renderLab(view, { bundle: withDerivation(derivation), messages: { ...loadViewMessages('en'), ...derivationLabels.en } });

  it('resets the selection when the selected word no longer exists (AES-256 w[50] → AES-128)', async () => {
    const { store } = render(longerDerivation());
    await userEvent.click(nodeButton('w/50'));
    expect(store.getState().selection.valueRefId).toBe('12/roundKey');
    act(() => store.getState().setBundle(withDerivation(aesDerivation)));
    expect(chain()).toBeNull();
    expect(store.getState().selection.valueRefId).toBeNull();
    expect(sources()).toEqual([]);
    act(() => store.getState().setBundle(withDerivation(longerDerivation())));
    expect(chain()).toBeNull();
    expect(nodeButton('w/50').getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the selection, its linked-brushing valueRef and source marks when the word still exists', async () => {
    const { store } = render(aesDerivation);
    await userEvent.click(nodeButton('w/4'));
    act(() => store.getState().setBundle(withDerivation(sameShapeDerivation())));
    expect(nodeButton('w/4').getAttribute('aria-expanded')).toBe('true');
    expect(chain()?.textContent).toContain('Word w[4]');
    expect(store.getState().selection.valueRefId).toBe('1/roundKey');
    expect(sources()).toEqual(['w/0', 'w/3']);
  });

  it('does not touch an existing lab selection on mount', () => {
    const store = createLabStore(aesDerivationBundle());
    store.getState().select('3/roundKey');
    renderLab(view, { store, messages: { ...loadViewMessages('en'), ...derivationLabels.en } });
    expect(store.getState().selection.valueRefId).toBe('3/roundKey');
  });
});

describe('DerivationView', () => {
  it('falls back to generic group headings without producer group labels', () => {
    const bundle = aesDerivationBundle();
    const derivation = { ...aesDerivation, groups: undefined };
    renderLab(view, {
      bundle: { ...bundle, facets: { ...bundle.facets, 'derivation@default': derivation } },
      messages: { ...loadViewMessages('en'), ...derivationLabels.en },
    });
    expect(screen.getAllByText(/^Group \d+/)).toHaveLength(11);
    expect(screen.getByRole('list', { name: 'Group 1 – not used yet' })).toBeTruthy();
  });

  it('re-renders only the words whose source mark flips on hover', () => {
    const renders = vi.fn();
    renderLab(
      <Profiler id="ks" onRender={(_id, _phase, actual) => renders(actual)}>
        {view}
      </Profiler>,
      { bundle: aesDerivationBundle(), messages: { ...loadViewMessages('en'), ...derivationLabels.en } },
    );
    renders.mockClear();
    fireEvent.mouseEnter(word('a0fafe17'));
    expect(sources()).toEqual(['w/0', 'w/3']);
    expect(document.querySelectorAll('[aria-expanded="true"]')).toHaveLength(0);
    expect(renders).toHaveBeenCalledTimes(1);
  });

  it('is styled by cv-derivation classes only (no inline styles)', () => {
    renderEnglish();
    expect(document.querySelector('section.cv-derivation')).toBeTruthy();
    expect(document.querySelectorAll('.cv-derivation__row')).toHaveLength(11);
    expect(document.querySelectorAll('button.cv-derivation__word')).toHaveLength(44);
    expect(document.querySelectorAll('.cv-derivation [style]')).toHaveLength(0);
  });

  it('lists 11 round keys of 4 focusable words', () => {
    renderEnglish();
    const rounds = within(screen.getByRole('region', { name: 'Key schedule' })).getAllByRole(
      'list',
    )[0]!;
    expect(within(rounds).getAllByText(/^Round key \d+/)).toHaveLength(11);
    expect(screen.getAllByRole('button')).toHaveLength(44);
    expect(word('a0fafe17').getAttribute('aria-label')).toBe('Word w[4]: a0fafe17');
    expect(screen.getByRole('list', { name: 'Round key 1 – not used yet' })).toBeTruthy();
  });

  it('marks the round key most recently used at the playhead', () => {
    const { store } = renderEnglish();
    expect(document.querySelector('[aria-current="step"]')).toBeNull();
    act(() => store.getState().seek(2));
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain(
      'Round key 0 – most recently used',
    );
    act(() => store.getState().seek(7));
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain(
      'Round key 1 – most recently used',
    );
    expect(document.querySelectorAll('[data-status="used"]')).toHaveLength(1);
  });

  it('discloses the chain of w[4] inside round key 1, before round key 2 (FIPS 197 App. A.1)', async () => {
    renderEnglish();
    expect(chain()).toBeNull();
    await userEvent.click(word('a0fafe17'));
    const panel = screen.getByRole('region', { name: 'How Word w[4] is derived' });
    expect(roundItem(1).contains(panel)).toBe(true);
    expect(roundItem(1).nextElementSibling).toBe(roundItem(2));
    const text = panel.textContent ?? '';
    for (const part of [
      'Key word w[3] 09cf4f3c',
      'RotWord for w[4] cf4f3c09',
      'SubWord for w[4] 8a84eb01',
      'Round constant Rcon[1] 01000000',
      '⊕ Rcon for w[4] 8b84eb01',
      'Key word w[0] 2b7e1516',
      'Word w[4] a0fafe17',
    ]) {
      expect(text).toContain(part);
    }
    expect(within(panel).getByLabelText('XOR with Round constant Rcon[1] (01000000)')).toBeTruthy();
    expect([...panel.querySelectorAll('.cv-derivation__op')].map((tag) => tag.textContent)).toEqual(['RotWord', 'SubWord', 'XOR', 'XOR']);
    expect(panel.querySelector('[data-result]')?.textContent).toContain('a0fafe17');
  });

  it('wires aria-expanded / aria-controls and announces the selection once', async () => {
    renderEnglish();
    expect(word('a0fafe17').getAttribute('aria-expanded')).toBe('false');
    expect(word('a0fafe17').hasAttribute('aria-controls')).toBe(false);
    await userEvent.click(word('a0fafe17'));
    expect(word('a0fafe17').getAttribute('aria-expanded')).toBe('true');
    expect(word('a0fafe17').getAttribute('aria-controls')).toBe(chain()?.id);
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(live().textContent).toBe(
      'Word w[4] selected – its derivation is shown below “Round key 1”.',
    );
    expect(document.activeElement).toBe(word('a0fafe17'));
  });

  it('keeps one chain open: selecting another word moves it, selecting again or Escape closes it', async () => {
    renderEnglish();
    await userEvent.click(word('a0fafe17'));
    await userEvent.click(word('d014f9a8'));
    expect(document.querySelectorAll('.cv-derivation__chain')).toHaveLength(1);
    expect(roundItem(10).contains(chain())).toBe(true);
    await userEvent.click(word('d014f9a8'));
    expect(chain()).toBeNull();
    expect(live().textContent).toBe('');
    word('2b7e1516').focus();
    await userEvent.keyboard('{Enter}');
    expect(chain()?.textContent).toContain('Key word w[0] is an input: it is not computed from other values.');
    await userEvent.keyboard('{Escape}');
    expect(chain()).toBeNull();
    expect(document.activeElement).toBe(word('2b7e1516'));
    await userEvent.keyboard(' ');
    expect(chain()).not.toBeNull();
  });

  it('marks the direct source words on hover and focus without opening a chain', async () => {
    renderEnglish();
    fireEvent.mouseEnter(word('a0fafe17'));
    expect(chain()).toBeNull();
    expect(sources()).toEqual(['w/0', 'w/3']);
    fireEvent.mouseLeave(word('a0fafe17'));
    expect(sources()).toEqual([]);
    act(() => word('88542cb1').focus());
    expect(sources()).toEqual(['w/1', 'w/4']);
  });

  it('publishes the selected word as the linked-brushing selection', async () => {
    const { store } = renderEnglish();
    await userEvent.click(word('a0fafe17'));
    expect(store.getState().selection.valueRefId).toBe('1/roundKey');
    await userEvent.keyboard('{Escape}');
    expect(store.getState().selection.valueRefId).toBeNull();
  });

  it('scrolls an opened chain into view with block: nearest', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    renderEnglish();
    await userEvent.click(word('a0fafe17'));
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }));
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it('renders German', () => {
    renderLab(view, {
      bundle: aesDerivationBundle(),
      messages: { ...loadVizMessages('de'), ...loadViewMessages('de'), ...derivationLabels.de },
    });
    expect(screen.getByRole('region', { name: 'Schlüsselplan' })).toBeTruthy();
    expect(screen.getAllByText(/^Rundenschlüssel \d+/).length).toBe(11);
    expect(word('2b7e1516').getAttribute('aria-label')).toBe('Schlüsselwort w[0]: 2b7e1516');
  });

  it('explains when the derivation facet is missing', () => {
    const bundle = aesDerivationBundle();
    renderLab(view, {
      bundle: { ...bundle, facets: { 'state@default': bundle.facets['state@default'] } },
      messages: loadViewMessages('en'),
    });
    expect(screen.getByRole('status').textContent).toBe('This lab does not record a derivation.');
  });

  it('shows a loading status without a bundle', () => {
    renderLab(view, { bundle: null, messages: loadViewMessages('en') });
    expect(screen.getByRole('status').textContent).toBe('Preparing the derivation…');
  });
});

/** A two-step HMAC-style derivation: key ‖ counter → HMAC (zoomed into a hash lab) → truncated result. */
function macDerivation(title?: DerivationFacet['title']): DerivationFacet {
  const node = (id: string, op: string, inputs: string[], extra: Partial<DerivationNode> = {}): DerivationNode => ({
    id,
    label: { key: `fixture.${id}` },
    bytes: [0xab, 0xcd],
    op,
    inputs,
    ...extra,
  });
  return {
    kind: 'derivation',
    schemaVersion: 1,
    ...(title === undefined ? {} : { title }),
    nodes: [
      node('prk', 'input', [], { result: true }),
      node('info', 'hkdfLabel', []),
      node('block', 'concat', ['prk', 'info']),
      node('mac', 'hmac', ['block'], { zoom: { producerId: 'sha256', params: { message: 'abcd' } } }),
      node('okm', 'pbkdf2Mix', ['mac'], { result: true }),
    ],
  };
}

const MAC_MESSAGES = {
  ...loadViewMessages('en'),
  'fixture.prk': 'PRK',
  'fixture.info': 'Info',
  'fixture.block': 'Block',
  'fixture.mac': 'T(1)',
  'fixture.okm': 'OKM',
  'fixture.title': 'HKDF-Expand',
};

function renderMac(options: { title?: DerivationFacet['title']; labHref?: (zoom: LabZoom) => string | undefined } = {}) {
  return renderLab(view, { bundle: withDerivation(macDerivation(options.title)), messages: MAC_MESSAGES, labHref: options.labHref });
}

describe('DerivationView heading', () => {
  it("shows the facet's title (AES: Key schedule) and names the region by it", () => {
    renderEnglish();
    expect(document.querySelector('.cv-derivation__title')?.textContent).toBe('Key schedule');
    expect(screen.getByRole('region', { name: 'Key schedule' })).toBeTruthy();
  });

  it('falls back to the view title without a facet title', () => {
    renderMac();
    expect(screen.getByRole('region', { name: 'Derivation' })).toBeTruthy();
  });

  it('renders a producer title such as HKDF-Expand', () => {
    renderMac({ title: { key: 'fixture.title' } });
    expect(screen.getByRole('region', { name: 'HKDF-Expand' })).toBeTruthy();
  });
});

describe('DerivationView op labels and zoom links', () => {
  it('names catalogued ops, falls back to the raw op name and marks operands by their op', async () => {
    renderMac();
    await userEvent.click(nodeButton('okm'));
    const panel = screen.getByRole('region', { name: 'How OKM is derived' });
    expect([...panel.querySelectorAll('.cv-derivation__op')].map((tag) => tag.textContent)).toEqual(['Concatenate', 'HMAC', 'pbkdf2Mix']);
    expect(within(panel).getByLabelText('Concatenate with Info (abcd)')).toBeTruthy();
    expect(panel.querySelector('[data-operand] .cv-derivation__glyph')?.textContent).toBe('‖');
  });

  it("links a node with a zoom to the host's lab", async () => {
    const labHref = vi.fn((zoom: LabZoom) => `/en/lab/${zoom.producerId}/#p=${zoom.params.message}`);
    renderMac({ labHref });
    await userEvent.click(nodeButton('okm'));
    const link = screen.getByRole('link', { name: 'Open the lab that computes T(1)' });
    expect(link.getAttribute('href')).toBe('/en/lab/sha256/#p=abcd');
    expect(link.textContent).toBe('Open this step’s lab');
    expect(labHref).toHaveBeenCalledWith({ producerId: 'sha256', params: { message: 'abcd' } });
  });

  it('renders no link without a host labHref or when the host cannot link', async () => {
    renderMac();
    await userEvent.click(nodeButton('okm'));
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders no link when the host cannot link to that producer', async () => {
    renderMac({ labHref: () => undefined });
    await userEvent.click(nodeButton('okm'));
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('never links AES nodes (no zoom)', async () => {
    renderLab(view, { bundle: aesDerivationBundle(), messages: { ...loadViewMessages('en'), ...derivationLabels.en }, labHref: () => '/x' });
    await userEvent.click(word('a0fafe17'));
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('DerivationView long chains', () => {
  /** A chain of `length` counter steps after one input (PBKDF2-like). */
  function chainOf(length: number): DerivationFacet {
    const nodes: DerivationNode[] = [{ id: 'n/0', label: { key: 'fixture.prk' }, bytes: [0], op: 'input', inputs: [], result: true }];
    for (let i = 1; i <= length; i++) nodes.push({ id: `n/${i}`, label: { key: 'fixture.block' }, bytes: [i], op: 'counter', inputs: [`n/${i - 1}`], result: i === length });
    return { kind: 'derivation', schemaVersion: 1, nodes };
  }

  it('lets a long chain scroll inside its own focusable box; a short one does not', async () => {
    renderLab(view, { bundle: withDerivation(chainOf(20)), messages: MAC_MESSAGES });
    await userEvent.click(nodeButton('n/20'));
    expect(chain()?.hasAttribute('data-long')).toBe(true);
    expect(chain()?.getAttribute('tabindex')).toBe('0');
  });

  it('keeps the AES chain unboxed', async () => {
    renderEnglish();
    await userEvent.click(word('a0fafe17'));
    expect(chain()?.hasAttribute('data-long')).toBe(false);
    expect(chain()?.hasAttribute('tabindex')).toBe(false);
  });
});
