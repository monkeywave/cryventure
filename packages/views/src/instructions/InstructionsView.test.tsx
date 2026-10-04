import { createLabStore, I18nProvider, LabRoot } from '@cryventure/viz';
import { defineDeriver, type Lens, type Locale } from '@cryventure/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFixtureBundle, renderLab } from '@cryventure/viz/testing';
import { loadViewMessages } from '../messages.ts';
import InstructionsView from './InstructionsView.tsx';
import { isaFixture } from '../testing/isaFixture.ts';
import fixture from './fixtures/aesC1.json';

const { bundle: aesBundle, derivedFacets: aesDerivedFacets, labels: aesLabels } = isaFixture(fixture);

const messagesIn = (locale: Locale) => ({ ...loadViewMessages(locale), ...aesLabels[locale] });

function renderView(
  lens: Lens = 'engineer',
  locale: Locale = 'en',
  facets?: Record<string, unknown>,
) {
  return renderLab(<InstructionsView labId="fixture" lens={lens} />, {
    bundle: aesBundle(facets),
    messages: messagesIn(locale),
  });
}

const VALUES = { 'values@default': aesDerivedFacets['values@default'] };
const ARM_ONLY = {
  ...VALUES,
  'instructions@aarch64-armv8-ce': aesDerivedFacets['instructions@aarch64-armv8-ce'],
};
const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const row = (address: string) =>
  rows().find(
    (candidate) => candidate.querySelector('.cv-instructions__address')?.textContent === address,
  )!;
const statuses = () => rows().map((candidate) => candidate.dataset['status']);
const chips = (element: HTMLElement) =>
  within(element)
    .queryAllByRole('listitem')
    .map((chip) => chip.textContent);

/** A promise resolved from outside (Promise.withResolvers is beyond the configured lib). */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe('InstructionsView', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps explicit table roles, so narrow panels can re-flow rows without losing semantics', () => {
    renderView();
    const table = screen.getByRole('table');
    expect(table.getAttribute('role')).toBe('table');
    for (const group of table.querySelectorAll('thead, tbody'))
      expect(group.getAttribute('role')).toBe('rowgroup');
    for (const tr of table.querySelectorAll('tr')) expect(tr.getAttribute('role')).toBe('row');
    for (const th of table.querySelectorAll('th'))
      expect(th.getAttribute('role')).toBe('columnheader');
    for (const td of table.querySelectorAll('td')) expect(td.getAttribute('role')).toBe('cell');
    // The "performs" header and cells share a class: the narrow layout moves them below the row.
    expect(table.querySelector('th.cv-instructions__does')?.textContent).toBe('Performs');
    expect(row('0x8').querySelector('td.cv-instructions__does')).not.toBeNull();
  });

  it('lists address, mnemonic and operands as a table', () => {
    renderView();
    const table = screen.getByRole('table', { name: 'x86-64 · AES-NI: 25 instructions' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Status', 'Address', 'Instruction', 'Operands', 'Performs']);
    const pxor = row('0x8');
    expect(pxor.querySelector('.cv-instructions__mnemonic')?.textContent).toBe('pxor');
    expect(within(pxor).getAllByRole('cell')[3]?.textContent).toMatch(/^xmm0.*, xmm1$/);
  });

  it('marks the current instruction with a glyph and aria-current, executed ones with ✓ (step semantics)', () => {
    const { store } = renderView();
    act(() => store.getState().seek(4));
    const aesenc = row('0x11');
    expect(aesenc.getAttribute('aria-current')).toBe('step');
    expect(aesenc.querySelector('.cv-instructions__status')?.textContent).toBe(
      '▶current instruction',
    );
    expect(statuses().slice(0, 6)).toEqual([
      'executed',
      'executed',
      'executed',
      'executed',
      'current',
      'pending',
    ]);
    expect(row('0x0').querySelector('.cv-instructions__status')?.textContent).toBe('✓executed');
    act(() => store.getState().seek(7));
    expect(row('0x11').dataset['status']).toBe('executed');
    expect(row('0x16').dataset['status']).toBe('executed');
    expect(row('0x1b').getAttribute('aria-current')).toBe('step');
    act(() => store.getState().seek(1));
    expect(rows().some((candidate) => candidate.hasAttribute('aria-current'))).toBe(false);
  });

  it('lists the AES operations an instruction covers as chips, in its order', () => {
    renderView();
    expect(chips(row('0x11'))).toEqual([
      'SubBytes (round 1)',
      'ShiftRows (round 1)',
      'MixColumns (round 1)',
      'AddRoundKey (round 1)',
    ]);
    expect(chips(row('0x0'))).toEqual([]);
  });

  it('shows the fusion note inline on the current aese/aesmc and marks it elsewhere', () => {
    const { store } = renderView('engineer', 'en', ARM_ONLY);
    act(() => store.getState().seek(3));
    expect(row('0x8').querySelector('.cv-instructions__note')?.textContent).toMatch(
      /^aese and aesmc work as a pair/,
    );
    expect(row('0xc').querySelector('.cv-instructions__note')).toBeNull();
    expect(row('0xc').querySelector('.cv-instructions__note-mark')?.textContent).toBe(
      '※Note: shown when this instruction is current.',
    );
    expect(chips(row('0x8'))).toEqual([
      'AddRoundKey (round 0)',
      'SubBytes (round 1)',
      'ShiftRows (round 1)',
    ]);
  });

  it('shows compiler provenance and an external Compiler Explorer link', () => {
    renderView();
    expect(
      screen.getByText(
        /^Compiled with Homebrew clang version 23\.1\.0 \(-target x86_64-linux-gnu .*\) for x86_64-linux-gnu, function aes_encrypt_block_128$/,
      ),
    ).toBeTruthy();
    const link = screen.getByRole('link', {
      name: 'Open in Compiler Explorer (opens in a new tab)',
    });
    expect(link.getAttribute('href')).toMatch(/^https:\/\/godbolt\.org\//);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('omits the link when the facet has no Compiler Explorer URL', () => {
    const facet = aesDerivedFacets['instructions@x86_64-aesni'] as {
      source: Record<string, string>;
    };
    const { compilerExplorerUrl: _url, ...source } = facet.source;
    renderView('engineer', 'en', { 'instructions@x86_64-aesni': { ...facet, source } });
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('publishes an operand ValueRef as the lab selection on hover and focus, and clears it on leave', () => {
    const { store } = renderView();
    const key = within(row('0x11')).getByRole('button', { name: /^xmm1/ });
    fireEvent.mouseEnter(key);
    expect(store.getState().selection.valueRefId).toBe('1/roundKey');
    expect(key.hasAttribute('data-selected')).toBe(true);
    fireEvent.mouseLeave(key);
    expect(store.getState().selection.valueRefId).toBeNull();
    act(() => key.focus());
    expect(store.getState().selection.valueRefId).toBe('1/roundKey');
    act(() => store.getState().select('2/roundKey'));
    act(() => key.blur());
    expect(store.getState().selection.valueRefId).toBe('2/roundKey');
  });

  it('highlights operands of a value another view selected (linked brushing)', () => {
    const { store } = renderView();
    act(() => store.getState().select('plaintext'));
    expect(
      [...document.querySelectorAll('[data-selected]')].map(
        (operand) => operand.textContent?.split('Plaintext')[0],
      ),
    ).toEqual(['xmm1', 'xmmword ptr [rdi]']);
  });

  it('subscribes to the selection once per listing, not once per linked operand', () => {
    const store = createLabStore(aesBundle());
    const subscribe = vi.spyOn(store, 'subscribe');
    renderLab(<InstructionsView labId="fixture" lens="engineer" />, { store, messages: messagesIn('en') });
    const linked = document.querySelectorAll('button.cv-instructions__operand').length;
    expect(linked).toBeGreaterThan(4);
    expect(subscribe.mock.calls.length).toBeLessThan(linked);
  });

  it('re-renders only the rows whose operands gain or lose the selection', () => {
    const { store } = renderView();
    const before = rows().map((candidate) => candidate.querySelector('code'));
    act(() => store.getState().select('plaintext'));
    const after = rows().map((candidate) => candidate.querySelector('code'));
    expect(after).toEqual(before);
    expect(document.querySelectorAll('[data-selected]').length).toBe(2);
    act(() => store.getState().select(null));
    expect(document.querySelectorAll('[data-selected]').length).toBe(0);
  });

  it('shows ValueRef names only in the cryptographer lens (hidden text otherwise)', () => {
    const { unmount } = renderView('cryptographer');
    const ref = row('0x11').querySelector('.cv-instructions__ref');
    expect(ref?.textContent).toBe('Round key (1/roundKey)');
    unmount();
    renderView('engineer');
    expect(row('0x11').querySelector('.cv-instructions__ref')).toBeNull();
    expect(within(row('0x11')).getByRole('button').textContent).toBe('xmm1Round key (1/roundKey)');
  });

  it('reduces the story lens to the mnemonic and the operation chips', () => {
    renderView('story');
    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Status', 'Instruction', 'Performs']);
    expect(within(table).queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('link')).toBeNull();
    expect(chips(rows()[4]!)).toEqual([
      'SubBytes (round 1)',
      'ShiftRows (round 1)',
      'MixColumns (round 1)',
      'AddRoundKey (round 1)',
    ]);
  });

  it('hides the fusion note in the story lens', () => {
    const { store } = renderView('story', 'en', ARM_ONLY);
    act(() => store.getState().seek(3));
    expect(
      document.querySelector('.cv-instructions__note, .cv-instructions__note-mark'),
    ).toBeNull();
  });

  it('picks the variant from the facet labels', async () => {
    const user = userEvent.setup();
    renderView();
    const picker = screen.getByRole('combobox', { name: 'Instruction set' });
    expect(
      within(picker)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['x86-64 · AES-NI', 'AArch64 · ARMv8 Crypto Extensions']);
    await user.selectOptions(picker, 'aarch64-armv8-ce');
    expect(
      screen.getByRole('table', { name: 'AArch64 · ARMv8 Crypto Extensions: 29 instructions' }),
    ).toBeTruthy();
  });

  it('scrolls the current row into view inside the listing only, never the page', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const { store, container } = renderView();
    const scroller = container.querySelector<HTMLElement>('.cv-instructions__scroll')!;
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ y: 0, height: 200 }),
    );
    vi.spyOn(scroller, 'clientHeight', 'get').mockReturnValue(200);
    vi.spyOn(HTMLTableRowElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ y: 500, height: 20 }),
    );
    act(() => store.getState().seek(10));
    expect(scroller.scrollTop).toBe(320);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('makes an overflowing listing keyboard-scrollable even in the story lens (no operand buttons)', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
    renderView('story');
    const scroller = screen.getByRole('region', { name: 'Instruction listing' });
    expect(scroller.querySelector('button')).toBeNull();
    expect(scroller.getAttribute('tabindex')).toBe('0');
  });

  it('keeps a listing that fits out of the tab order', () => {
    renderView('story');
    expect(screen.getByRole('region', { name: 'Instruction listing' }).hasAttribute('tabindex')).toBe(false);
  });

  it('speaks German', () => {
    renderView('cryptographer', 'de');
    expect(screen.getByRole('region', { name: 'Befehle' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'x86-64 · AES-NI: 25 Befehle' })).toBeTruthy();
    expect(
      screen.getByRole('link', {
        name: 'Im Compiler Explorer öffnen (öffnet sich in einem neuen Tab)',
      }),
    ).toBeTruthy();
    expect(row('0x11').querySelector('.cv-instructions__ref')?.textContent).toBe(
      'Rundenschlüssel (1/roundKey)',
    );
  });

  it('explains when the facet is missing', () => {
    renderLab(<InstructionsView labId="fixture" lens="engineer" />, {
      bundle: createFixtureBundle(),
      messages: messagesIn('en'),
    });
    expect(screen.getByRole('status').textContent).toBe(
      loadViewMessages('en')['view.instructions.missing'],
    );
  });

  it('shows its own loading message while a deriver runs, then the listing', async () => {
    const { promise, resolve } = deferred<Record<string, unknown>>();
    const deriver = defineDeriver({
      kind: 'deriver',
      id: 'fake-isa',
      apiVersion: 1,
      from: ['state'],
      provides: ['instructions'],
      load: () => promise.then((facets) => ({ derive: () => facets })),
    });
    render(
      <I18nProvider messages={messagesIn('en')}>
        <LabRoot store={createLabStore(aesBundle(VALUES))} derivers={[deriver]}>
          <InstructionsView labId="fixture" lens="engineer" />
        </LabRoot>
      </I18nProvider>,
    );
    expect(screen.getByRole('status').textContent).toBe('Deriving the instruction listing…');
    await act(async () => resolve(ARM_ONLY));
    expect(await screen.findByRole('table', { name: /^AArch64/ })).toBeTruthy();
  });
});
