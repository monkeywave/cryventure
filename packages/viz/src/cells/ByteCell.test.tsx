import { act, fireEvent, render, screen } from '@testing-library/react';
import { Profiler } from 'react';
import { motionValue } from 'motion/react';
import { describe, expect, it, vi } from 'vitest';
import type { Track } from '@cryventure/core';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { vizMessages } from '../i18n/messages.ts';
import { createLabStore } from '../lab/createLabStore.ts';
import { LabRoot } from '../lab/LabRoot.tsx';
import { renderLab } from '../testing/renderLab.tsx';
import { ByteCell, type ByteCellProps } from './ByteCell.tsx';

const renderCell = (ui: React.ReactNode, messages = vizMessages.en) =>
  render(
    <I18nProvider messages={messages}>
      <div role="grid">
        <div role="row">{ui}</div>
      </div>
    </I18nProvider>,
  );

describe('ByteCell', () => {
  it('shows hex and a 1-based, translated aria-label', () => {
    renderCell(<ByteCell value={0x3a} row={0} col={1} index={4} />);
    const cell = screen.getByRole('gridcell', { name: 'row 1, column 2, value 0x3a' });
    expect(cell.textContent).toBe('3a');
    expect(cell.getAttribute('data-index')).toBe('4');
    expect(cell.tabIndex).toBe(-1);
  });

  it('marks highlights with class, data attribute, glyph and label', () => {
    renderCell(<ByteCell value={1} row={2} col={3} index={0} highlight="xor" tabbable />);
    const cell = screen.getByRole('gridcell', { name: 'row 3, column 4, value 0x01, XOR-combined' });
    expect(cell.className).toContain('cv-cell--xor');
    expect(cell.getAttribute('data-highlight')).toBe('xor');
    expect(cell.querySelector('.cv-cell__glyph')?.textContent).toBe('⊕');
    expect(cell.tabIndex).toBe(0);
  });

  it('translates to German', () => {
    renderCell(<ByteCell value={0xff} row={0} col={0} index={0} highlight="sbox" />, vizMessages.de);
    expect(screen.getByRole('gridcell', { name: 'Zeile 1, Spalte 1, Wert 0xff, durch die S-Box ersetzt' })).toBeTruthy();
  });

  it('keeps showing the latest value after a change', () => {
    const { rerender } = renderCell(<ByteCell value={1} row={0} col={0} index={0} />);
    rerender(
      <I18nProvider messages={vizMessages.en}>
        <div role="grid">
          <div role="row">
            <ByteCell value={2} row={0} col={0} index={0} />
          </div>
        </div>
      </I18nProvider>,
    );
    expect(screen.getByRole('gridcell').textContent).toBe('02');
  });
});

describe('ByteCell motion', () => {
  const emphasisTrack = (keyframes: Track['keyframes']): Track => ({ target: { region: 'state', index: 0 }, prop: 'emphasis', keyframes });
  const valueTrack: Track = {
    target: { region: 'state', index: 0 },
    prop: 'value',
    keyframes: [
      { at: 0.6, value: 0 },
      { at: 1, value: 1, ease: 'linear' },
    ],
  };
  const allProps: Track[] = (['dx', 'dy', 'scale', 'opacity', 'emphasis'] as const).map((prop, offset) => ({
    target: { region: 'state', index: 0 },
    prop,
    keyframes: [
      { at: 0, value: offset },
      { at: 1, value: offset + 10, ease: 'linear' },
    ],
  }));

  function renderMotionCell(props: Partial<ByteCellProps> = {}) {
    const result = renderLab(
      <div role="grid">
        <div role="row">
          <ByteCell value={0xaa} row={0} col={0} index={0} {...props} />
        </div>
      </div>,
    );
    return { ...result, cell: () => screen.getByRole('gridcell') };
  }

  it('shows the before value until the middle of the step without a value track; the label states the end value', () => {
    const progress = motionValue(0);
    const { cell } = renderMotionCell({ motion: { progress, tracks: [], before: 0x10 } });
    expect(cell().textContent).toBe('10');
    expect(cell().getAttribute('aria-label')).toBe('row 1, column 1, value 0xaa');
    act(() => progress.set(0.49));
    expect(cell().textContent).toBe('10');
    act(() => progress.set(0.5));
    expect(cell().textContent).toBe('aa');
    expect(cell().getAttribute('aria-label')).toBe('row 1, column 1, value 0xaa');
    act(() => progress.set(0.2));
    expect(cell().textContent).toBe('10');
  });

  it('switches the value when the value track reaches 0.5', () => {
    const progress = motionValue(0);
    const { cell } = renderMotionCell({ motion: { progress, tracks: [valueTrack], before: 0x10 } });
    act(() => progress.set(0.5));
    expect(cell().textContent).toBe('10');
    act(() => progress.set(0.79));
    expect(cell().textContent).toBe('10');
    act(() => progress.set(0.8));
    expect(cell().textContent).toBe('aa');
  });

  it('writes track samples as CSS custom properties without re-rendering', () => {
    const progress = motionValue(0);
    const { cell } = renderMotionCell({ motion: { progress, tracks: allProps, before: 0xaa } });
    const style = () => cell().style;
    expect(cell().hasAttribute('data-animated')).toBe(true);
    expect(style().getPropertyValue('--cv-dx')).toBe('0');
    expect(style().getPropertyValue('--cv-emphasis')).toBe('4');
    act(() => progress.set(0.5));
    expect(style().getPropertyValue('--cv-dx')).toBe('5');
    expect(style().getPropertyValue('--cv-dy')).toBe('6');
    expect(style().getPropertyValue('--cv-scale')).toBe('7');
    expect(style().getPropertyValue('--cv-opacity')).toBe('8');
    expect(style().getPropertyValue('--cv-emphasis')).toBe('9');
  });

  it('does not commit React renders while the playhead moves within the same value phase', () => {
    const progress = motionValue(0.6);
    const onRender = vi.fn();
    renderLab(
      <Profiler id="cell" onRender={onRender}>
        <div role="grid">
          <div role="row">
            <ByteCell value={0xaa} row={0} col={0} index={0} motion={{ progress, tracks: allProps, before: 0xaa }} />
          </div>
        </div>
      </Profiler>,
    );
    const commits = onRender.mock.calls.length;
    act(() => {
      progress.set(0.7);
      progress.set(0.75);
    });
    expect(onRender.mock.calls.length).toBe(commits);
    expect(screen.getByRole('gridcell').style.getPropertyValue('--cv-dx')).toBe('7.5');
  });

  it('only sets the properties its tracks drive', () => {
    const progress = motionValue(0.5);
    const { cell } = renderMotionCell({ motion: { progress, tracks: [emphasisTrack([{ at: 0, value: 1 }])], before: 0xaa } });
    expect(cell().style.getPropertyValue('--cv-emphasis')).toBe('1');
    expect(cell().style.getPropertyValue('--cv-dx')).toBe('');
  });

  it('clears styles and data-animated when the tracks go away and on unmount', () => {
    const progress = motionValue(0);
    const tracks = [emphasisTrack([{ at: 0, value: 1 }])];
    const { cell, rerender, unmount } = renderMotionCell({ motion: { progress, tracks, before: 0xaa } });
    expect(cell().style.getPropertyValue('--cv-emphasis')).toBe('1');
    const element = cell();
    rerender(
      <I18nProvider messages={vizMessages.en}>
        <LabRoot store={createLabStore()}>
          <div role="grid">
            <div role="row">
              <ByteCell value={0xaa} row={0} col={0} index={0} />
            </div>
          </div>
        </LabRoot>
      </I18nProvider>,
    );
    expect(element.hasAttribute('data-animated')).toBe(false);
    expect(element.style.getPropertyValue('--cv-emphasis')).toBe('');
    unmount();
  });

  it('removes its progress subscription on unmount', () => {
    const progress = motionValue(0);
    const { cell, unmount } = renderMotionCell({ motion: { progress, tracks: [emphasisTrack([{ at: 0, value: 0 }, { at: 1, value: 1, ease: 'linear' }])], before: 0xaa } });
    const element = cell();
    unmount();
    expect(element.hasAttribute('data-animated')).toBe(false);
    progress.set(0.5);
    expect(element.style.getPropertyValue('--cv-emphasis')).toBe('');
  });

  it('marks dimmed and selected cells', () => {
    const { cell } = renderMotionCell({ dimmed: true, selected: true });
    expect(cell().hasAttribute('data-dimmed')).toBe(true);
    expect(cell().getAttribute('aria-selected')).toBe('true');
  });

  it('marks focused cells', () => {
    const { cell } = renderMotionCell({ focused: true });
    expect(cell().hasAttribute('data-focused')).toBe(true);
    expect(cell().hasAttribute('data-dimmed')).toBe(false);
  });

  it('has no dimmed/focused/selected markers by default', () => {
    const { cell } = renderMotionCell();
    expect(cell().hasAttribute('data-dimmed')).toBe(false);
    expect(cell().hasAttribute('data-focused')).toBe(false);
    expect(cell().hasAttribute('aria-selected')).toBe(false);
  });

  it('selects on click and Enter only', () => {
    const onSelect = vi.fn();
    const { cell } = renderMotionCell({ onSelect });
    fireEvent.click(cell());
    expect(onSelect).toHaveBeenCalledTimes(1);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    fireEvent(cell(), enter);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(enter.defaultPrevented).toBe(true);
    fireEvent.keyDown(cell(), { key: 'a' });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('ignores Enter without onSelect', () => {
    const { cell } = renderMotionCell();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    fireEvent(cell(), enter);
    expect(enter.defaultPrevented).toBe(false);
  });
});
