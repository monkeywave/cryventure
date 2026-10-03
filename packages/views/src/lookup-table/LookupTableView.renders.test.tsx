import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderLab } from '@cryventure/viz/testing';
import { loadViewMessages } from '../messages.ts';
import LookupTableView from './LookupTableView.tsx';
import { sboxTable, tableBundle, tableLabels } from './testFixture.ts';

/** Every component of the view calls `useT` once per render, so its call count is a render counter. */
const renders = vi.hoisted(() => ({ count: 0 }));
vi.mock('@cryventure/viz', async (importOriginal) => {
  const viz = await importOriginal<typeof import('@cryventure/viz')>();
  return {
    ...viz,
    useT: () => {
      renders.count++;
      return viz.useT();
    },
  };
});

const cell = (index: number) => document.querySelector<HTMLElement>(`[data-index="${index}"]`)!;
const caption = () => document.querySelector('.cv-lookup-table__caption')!.textContent;

describe('LookupTableView render cost', () => {
  it('re-renders only the caption when the pointer crosses cells', () => {
    renderLab(<LookupTableView labId="fixture" lens="engineer" />, {
      bundle: tableBundle(sboxTable({ selected: 0x53, selectParam: 'byteHex' })),
      messages: { ...loadViewMessages('en'), ...tableLabels },
    });
    expect(renders.count).toBeGreaterThan(256);
    renders.count = 0;
    fireEvent.mouseEnter(cell(0x00));
    expect(caption()).toBe('00 → 63');
    fireEvent.mouseLeave(cell(0x00));
    fireEvent.mouseEnter(cell(0x01));
    expect(caption()).toBe('01 → 7c');
    // enter 00, leave (back to the selection), enter 01: three caption renders, nothing else.
    expect(renders.count).toBe(3);
  });
});
