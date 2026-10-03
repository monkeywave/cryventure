import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TableFacet } from '@cryventure/core';
import { createFixtureBundle, renderLab } from '@cryventure/viz/testing';
import { loadViewMessages } from '../messages.ts';
import LookupTableView from './LookupTableView.tsx';
import { sboxTable, tableBundle, tableLabels } from './testFixture.ts';

const view = <LookupTableView labId="fixture" lens="engineer" />;

function render(table: TableFacet, lang: 'en' | 'de' = 'en') {
  const onRequestParams = vi.fn();
  const result = renderLab(view, {
    bundle: tableBundle(table),
    messages: { ...loadViewMessages(lang), ...tableLabels },
    onRequestParams,
  });
  return { ...result, onRequestParams };
}

const cell = (index: number) => document.querySelector<HTMLElement>(`[data-index="${index}"]`)!;
const caption = () => document.querySelector('.cv-lookup-table__caption')!.textContent;
const selectedIndices = () =>
  [...document.querySelectorAll('[aria-selected="true"]')].map((node) =>
    Number(node.getAttribute('data-index')),
  );

describe('LookupTableView', () => {
  it('renders a 16×16 ARIA grid with nibble headers and hex entries', () => {
    render(sboxTable());
    const grid = screen.getByRole('grid', { name: 'S-box' });
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(256);
    expect(within(grid).getAllByRole('columnheader')).toHaveLength(17);
    expect(within(grid).getByRole('rowheader', { name: 'Row 5x' }).textContent).toBe('5x');
    expect(within(grid).getByRole('columnheader', { name: 'Column x3' }).textContent).toBe('x3');
    expect(cell(0x53).textContent).toBe('ed');
    expect(cell(0x53).getAttribute('aria-label')).toBe('Input 53 → output ed');
  });

  it('highlights the selected cell and its row and column headers (crosshair)', () => {
    render(sboxTable({ selected: 0x53 }));
    expect(selectedIndices()).toEqual([0x53]);
    expect(document.querySelector('.cv-lookup-table__rowheader[data-active]')?.textContent).toBe(
      '5x',
    );
    expect(document.querySelector('.cv-lookup-table__colheader[data-active]')?.textContent).toBe(
      'x3',
    );
    expect(cell(0x53).tabIndex).toBe(0);
    expect(caption()).toBe('53 → ed');
  });

  it('labels the selected cell like any other, with no extra glyph', () => {
    render(sboxTable({ selected: 0x53 }));
    expect(cell(0x53).getAttribute('aria-label')).toBe('Input 53 → output ed');
    expect(cell(0x53).textContent).toBe('ed');
    expect(screen.getByRole('grid').parentElement!.classList.contains('cv-scroll-shadow')).toBe(
      true,
    );
  });

  it('requests the clicked input as a 2-digit hex param and shows it at once', async () => {
    const { onRequestParams, store } = render(sboxTable({ selected: 0, selectParam: 'inputHex' }));
    await userEvent.click(cell(0x05));
    expect(onRequestParams).toHaveBeenCalledWith({ inputHex: '05' });
    expect(selectedIndices()).toEqual([0x05]);
    // The re-run's facet decides from then on.
    act(() =>
      store
        .getState()
        .setBundle(tableBundle(sboxTable({ selected: 0x07, selectParam: 'inputHex' }))),
    );
    expect(selectedIndices()).toEqual([0x07]);
  });

  it('selects with Enter and Space', () => {
    const { onRequestParams } = render(sboxTable({ selectParam: 'inputHex' }));
    fireEvent.keyDown(cell(0x10), { key: 'Enter' });
    fireEvent.keyDown(cell(0xff), { key: ' ' });
    expect(onRequestParams.mock.calls).toEqual([[{ inputHex: '10' }], [{ inputHex: 'ff' }]]);
  });

  it('is read-only without selectParam', async () => {
    const { onRequestParams } = render(sboxTable());
    await userEvent.click(cell(0x05));
    fireEvent.keyDown(cell(0x05), { key: 'Enter' });
    expect(onRequestParams).not.toHaveBeenCalled();
    expect(selectedIndices()).toEqual([]);
    expect(screen.getByRole('grid').getAttribute('aria-readonly')).toBe('true');
  });

  it('moves focus with arrows, Home and End (roving tabindex) and names the focused cell', async () => {
    render(sboxTable({ selected: 0x53 }));
    await userEvent.tab();
    expect(document.activeElement).toBe(cell(0x53));
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(cell(0x54));
    expect(caption()).toBe('54 → 20');
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(cell(0x64));
    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(cell(0x6f));
    await userEvent.keyboard('{Home}');
    expect(document.activeElement).toBe(cell(0x60));
    expect([...document.querySelectorAll('[role="gridcell"][tabindex="0"]')]).toEqual([cell(0x60)]);
  });

  it('names the hovered cell in the caption', async () => {
    render(sboxTable());
    expect(caption()).toBe('Point at a cell to read its input and output.');
    await userEvent.hover(cell(0x00));
    expect(caption()).toBe('00 → 63');
    await userEvent.unhover(cell(0x00));
    expect(caption()).toBe('Point at a cell to read its input and output.');
  });

  it('names the clicked cell after a click, even if the layout shifts under the resting pointer', async () => {
    const { store } = render(sboxTable({ selected: 0, selectParam: 'inputHex' }));
    fireEvent.mouseEnter(cell(0x40));
    fireEvent.click(cell(0x40), { clientX: 100, clientY: 100 });
    expect(caption()).toBe('40 → 09');
    // A re-run delivers the new facet and shifts the layout: the resting pointer is now over 30.
    act(() =>
      store
        .getState()
        .setBundle(tableBundle(sboxTable({ selected: 0x40, selectParam: 'inputHex' }))),
    );
    fireEvent.mouseLeave(cell(0x40));
    fireEvent.mouseEnter(cell(0x30));
    fireEvent.mouseMove(cell(0x30), { clientX: 100, clientY: 100 });
    expect(caption()).toBe('40 → 09');
    // A real pointer move hands the caption back to the hovered cell.
    fireEvent.mouseMove(cell(0x30), { clientX: 120, clientY: 90 });
    expect(caption()).toBe('30 → 04');
    fireEvent.mouseLeave(cell(0x30));
    fireEvent.mouseEnter(cell(0x31));
    expect(caption()).toBe('31 → c7');
  });

  it('reverts the caption to the selected cell when the pointer leaves and focus moves away', async () => {
    render(sboxTable({ selected: 0x53, selectParam: 'inputHex' }));
    await userEvent.hover(cell(0x00));
    expect(caption()).toBe('00 → 63');
    await userEvent.unhover(cell(0x00));
    expect(caption()).toBe('53 → ed');
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');
    expect(caption()).toBe('54 → 20');
    await userEvent.tab();
    expect(caption()).toBe('53 → ed');
  });

  it('speaks German', () => {
    render(sboxTable(), 'de');
    expect(cell(0x53).getAttribute('aria-label')).toBe('Eingabe 53 → Ausgabe ed');
    expect(screen.getByRole('rowheader', { name: 'Zeile 5x' })).toBeTruthy();
  });

  it('explains when the table facet is missing', () => {
    renderLab(view, {
      bundle: { ...createFixtureBundle(), facets: {} },
      messages: loadViewMessages('en'),
    });
    expect(screen.getByRole('status').textContent).toBe(
      loadViewMessages('en')['view.lookup-table.missing'],
    );
  });
});
