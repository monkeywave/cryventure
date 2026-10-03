import { act, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderLab } from '@cryventure/viz/testing';
import { loadViewMessages } from '../messages.ts';
import MemoryView from './MemoryView.tsx';
import type { MemoryUnit } from './memoryModel.ts';
import { KEY_STEP, deriverLabels, memoryBundle } from './testFixture.ts';

// Rows narrower than one 16-byte round key: a row may only claim a ref that starts inside it.
const { NARROW_ROW } = vi.hoisted(() => ({ NARROW_ROW: 8 }));

vi.mock('./memoryModel.ts', async (importOriginal) => {
  const model = await importOriginal<typeof import('./memoryModel.ts')>();
  const halve = (row: MemoryUnit[]) => {
    const start = row[0]?.offset ?? 0;
    const head = row.filter((unit) => unit.offset < start + NARROW_ROW);
    const tail = row.filter((unit) => unit.offset >= start + NARROW_ROW);
    return tail.length === 0 ? [head] : [head, tail];
  };
  return {
    ...model,
    BYTES_PER_ROW: NARROW_ROW,
    memoryRows: (...args: Parameters<typeof model.memoryRows>) =>
      model.memoryRows(...args).flatMap(halve),
  };
});

describe('MemoryView round-key gutter with a different row width', () => {
  it('labels only the rows a round key starts in (row width from BYTES_PER_ROW)', () => {
    const { store } = renderLab(<MemoryView labId="fixture" lens="cryptographer" />, {
      bundle: memoryBundle(),
      messages: { ...loadViewMessages('en'), ...deriverLabels.en },
    });
    act(() => store.getState().seek(KEY_STEP));
    const key = document.querySelector<HTMLElement>('[data-allocation="key"]')!;
    const tagged = within(key)
      .getAllByRole('rowheader')
      .map((header, row) => (header.querySelector('.cv-memory__reftag') ? row : -1))
      .filter((row) => row !== -1);
    expect(tagged).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  });
});
