import { createLabStore, I18nProvider, LabRoot } from '@cryventure/viz';
import { defineDeriver, type Lens, type Locale } from '@cryventure/core';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFixtureBundle, renderLab } from '@cryventure/viz/testing';
import { loadViewMessages } from '../messages.ts';
import RegistersView from './RegistersView.tsx';
import { AES_STEP_COUNT, aesBundle, aesDerivedFacets, aesLabels } from './aesFixture.ts';

const messagesIn = (locale: Locale) => ({ ...loadViewMessages(locale), ...aesLabels[locale] });

function renderView(
  lens: Lens = 'engineer',
  locale: Locale = 'en',
  facets?: Record<string, unknown>,
) {
  return renderLab(<RegistersView labId="fixture" lens={lens} />, {
    bundle: aesBundle(facets),
    messages: messagesIn(locale),
  });
}

const X86_ONLY = { 'registers@x86_64-aesni': aesDerivedFacets['registers@x86_64-aesni'] };
const grid = () => screen.getByRole('grid');
/** Displayed cell texts of one register row (the header row is row 0). */
const rowBytes = (name: string) =>
  within(grid())
    .getAllByRole('row')
    .find((row) => row.querySelector('[role="rowheader"]')?.textContent?.startsWith(name))!
    .querySelectorAll('.cv-cell__value');
const hexOf = (name: string) => [...rowBytes(name)].map((cell) => cell.textContent).join('');
const rowHeader = (name: string) =>
  within(grid())
    .getAllByRole('rowheader')
    .find((header) => header.textContent?.startsWith(name))!;

/** A promise resolved from outside (Promise.withResolvers is beyond the configured lib). */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe('RegistersView', () => {
  it('shows each used register as 16 byte cells, unwritten ones as ··', () => {
    renderView();
    expect(screen.getByRole('region', { name: 'Registers' })).toBeTruthy();
    expect(rowBytes('xmm0')).toHaveLength(16);
    expect(hexOf('xmm1')).toBe('··'.repeat(16));
    expect(rowHeader('xmm1').getAttribute('aria-label')).toBe('xmm1, not written yet');
  });

  it('replays the writes visible at the playhead and flags the registers written at that step', () => {
    const { store } = renderView('engineer', 'en', X86_ONLY);
    act(() => store.getState().seek(0));
    expect(hexOf('xmm1')).toBe('00112233445566778899aabbccddeeff');
    expect(rowHeader('xmm1').getAttribute('aria-label')).toBe('xmm1, written in this step');
    expect(rowHeader('xmm1').closest('[role="row"]')?.hasAttribute('data-current')).toBe(true);
    expect(rowBytes('xmm1')[0]?.closest('[role="gridcell"]')?.getAttribute('data-highlight')).toBe(
      'write',
    );
    act(() => store.getState().seek(1));
    expect(rowHeader('xmm1').getAttribute('aria-label')).toBe('xmm1');
    expect(rowBytes('xmm1')[0]?.closest('[role="gridcell"]')?.hasAttribute('data-highlight')).toBe(
      false,
    );
  });

  it('keeps the value from before an instruction in flight (aesenc, steps 3–6), then shows FIPS 197 C.1 round[2].start', () => {
    const { store } = renderView('engineer', 'en', X86_ONLY);
    act(() => store.getState().seek(3));
    expect(hexOf('xmm0')).toBe('00102030405060708090a0b0c0d0e0f0');
    expect(rowHeader('xmm0').textContent).toBe('xmm0 ⧗');
    expect(rowHeader('xmm0').getAttribute('aria-label')).toBe(
      'xmm0, about to be written by the instruction in flight',
    );
    act(() => store.getState().seek(6));
    expect(hexOf('xmm0')).toBe('89d810e8855ace682d1843d8cb128fe4');
    act(() => store.getState().seek(AES_STEP_COUNT - 1));
    expect(hexOf('xmm0')).toBe('69c4e0d86a7b0430d8cdb78070b4c55a');
  });

  it('flips to register notation (MSB first) and back', async () => {
    const user = userEvent.setup();
    const { store } = renderView('engineer', 'en', X86_ONLY);
    act(() => store.getState().seek(0));
    await user.click(screen.getByRole('radio', { name: 'register notation (MSB first)' }));
    expect(hexOf('xmm1')).toBe('ffeeddccbbaa99887766554433221100');
    expect(within(grid()).getAllByRole('columnheader')[0]?.textContent).toBe('15');
    expect(grid().getAttribute('aria-label')).toBe(
      'Register contents, bytes in register notation (MSB first)',
    );
    await user.click(screen.getByRole('radio', { name: 'memory order' }));
    expect(hexOf('xmm1')).toBe('00112233445566778899aabbccddeeff');
  });

  it('switches lanes from the facet and lists lane values (numbers) in the chosen order', async () => {
    const user = userEvent.setup();
    const { store, container } = renderView('engineer', 'en', X86_ONLY);
    act(() => store.getState().seek(2));
    expect(
      screen
        .getAllByRole('radio', { name: /bit$/ })
        .map((radio) => radio.parentElement?.textContent),
    ).toEqual(['8 bit', '16 bit', '32 bit', '64 bit']);
    expect(screen.queryByRole('table')).toBeNull();
    await user.click(screen.getByRole('radio', { name: '32 bit' }));
    expect(container.querySelector('.cv-registers')?.getAttribute('data-lane-bytes')).toBe('4');
    const lanes = screen.getByRole('table', { name: /Lane values \(32-bit/ });
    const xmm1 = within(lanes).getByRole('rowheader', { name: 'xmm1' }).closest('tr')!;
    expect([...xmm1.querySelectorAll('td')].map((cell) => cell.textContent)).toEqual([
      '33221100',
      '77665544',
      'bbaa9988',
      'ffeeddcc',
    ]);
    await user.click(screen.getByRole('radio', { name: 'register notation (MSB first)' }));
    expect(
      within(lanes)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['lane 3', 'lane 2', 'lane 1', 'lane 0']);
    expect(
      within(lanes).getByRole('rowheader', { name: 'xmm0' }).closest('tr')?.querySelector('td')
        ?.textContent,
    ).toBe('f0e0d0c0');
  });

  it('picks the variant from the facet labels and keeps the choice in component state', async () => {
    const user = userEvent.setup();
    renderView();
    const picker = screen.getByRole('combobox', { name: 'Instruction set' });
    expect(
      within(picker)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'x86-64 · AES-NI · XMM registers',
      'AArch64 · ARMv8 Crypto Extensions · vector registers',
    ]);
    expect(rowHeader('xmm0')).toBeTruthy();
    await user.selectOptions(picker, 'aarch64-armv8-ce');
    expect(
      within(grid())
        .getAllByRole('rowheader')
        .map((header) => header.textContent),
    ).toEqual(['v0', 'v1', 'v2']);
  });

  it('keeps the picker compact: the select stays named, the full variant name sits in the title', async () => {
    const user = userEvent.setup();
    renderView();
    const picker = screen.getByRole('combobox', { name: 'Instruction set' });
    await user.selectOptions(picker, 'aarch64-armv8-ce');
    expect(picker.closest('[title]')?.getAttribute('title')).toBe('AArch64 · ARMv8 Crypto Extensions · vector registers');
  });

  it('hides the picker for a single variant', () => {
    renderView('engineer', 'en', X86_ONLY);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('speaks German', () => {
    renderView('story', 'de');
    expect(screen.getByRole('region', { name: 'Register' })).toBeTruthy();
    expect(
      screen.getByRole('radio', { name: 'Registerschreibweise (höchstwertiges Byte zuerst)' }),
    ).toBeTruthy();
    expect(rowHeader('xmm1').getAttribute('aria-label')).toBe('xmm1, noch nicht geschrieben');
  });

  it('explains when the facet is missing', () => {
    renderLab(<RegistersView labId="fixture" lens="engineer" />, {
      bundle: createFixtureBundle(),
      messages: messagesIn('en'),
    });
    expect(screen.getByRole('status').textContent).toBe(
      loadViewMessages('en')['view.registers.missing'],
    );
  });

  it('shows its own loading message while a deriver runs, then the derived registers', async () => {
    const { promise, resolve: finish } = deferred<Record<string, unknown>>();
    const deriver = defineDeriver({
      kind: 'deriver',
      id: 'fake-isa',
      apiVersion: 1,
      from: ['state'],
      provides: ['registers'],
      load: () => promise.then((facets) => ({ derive: () => facets })),
    });
    const store = createLabStore(aesBundle({}));
    render(
      <I18nProvider messages={messagesIn('en')}>
        <LabRoot store={store} derivers={[deriver]}>
          <RegistersView labId="fixture" lens="engineer" />
        </LabRoot>
      </I18nProvider>,
    );
    expect(screen.getByRole('status').textContent).toBe('Deriving the register contents…');
    await act(async () => finish(X86_ONLY));
    expect(await screen.findByRole('grid')).toBeTruthy();
    expect(rowHeader('xmm0')).toBeTruthy();
  });
});
