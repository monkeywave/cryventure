import { act, screen } from '@testing-library/react';
import { Profiler, type ReactNode } from 'react';
import { motionValue } from 'motion/react';
import { describe, expect, it, vi } from 'vitest';
import type { Track } from '@cryventure/core';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { vizMessages } from '../i18n/messages.ts';
import { LabRoot } from '../lab/LabRoot.tsx';
import { renderLab } from '../testing/renderLab.tsx';
import { ByteGrid } from './ByteGrid.tsx';
import { createGridMotionRunner, planGridMotion, type GridMotion } from './gridMotion.ts';

const VALUES = [0xaa, 1, 2, 3];
const at = (index: number): Track['target'] => ({ region: 'state', index });
const linear = (index: number, prop: Track['prop'], from: number, to: number): Track => ({
  target: at(index),
  prop,
  keyframes: [
    { at: 0, value: from },
    { at: 1, value: to, ease: 'linear' },
  ],
});
const valueTrack: Track = {
  target: at(0),
  prop: 'value',
  keyframes: [
    { at: 0.6, value: 0 },
    { at: 1, value: 1, ease: 'linear' },
  ],
};
const allProps = (index: number): Track[] => (['dx', 'dy', 'scale', 'opacity', 'emphasis'] as const).map((prop, offset) => linear(index, prop, offset, offset + 10));

function motionOf(progress: ReturnType<typeof motionValue<number>>, tracks: Record<number, Track[]>, before: readonly number[] = VALUES): GridMotion {
  return { progress, before, tracks: new Map(Object.entries(tracks).map(([index, list]) => [Number(index), list])) };
}

function renderGrid(motion: GridMotion | undefined, values: readonly number[] = VALUES) {
  const result = renderLab(<ByteGrid values={values} shape={[1, values.length]} label="State" motion={motion} />);
  return { ...result, cell: (index = 0) => document.querySelector(`[data-index="${index}"]`) as HTMLElement };
}

describe('planGridMotion', () => {
  const progress = motionValue(0);

  it('is empty without motion and skips unchanged cells without tracks', () => {
    expect(planGridMotion(undefined, VALUES)).toEqual([]);
    expect(planGridMotion(motionOf(progress, {}), VALUES)).toEqual([]);
  });

  it('switches a cell that was not yet written even when its value stays the same', () => {
    const motion = { ...motionOf(progress, {}), unwrittenBefore: new Set([3]) };
    expect(planGridMotion(motion, VALUES)).toEqual([{ index: 3, channels: [], valueTrack: undefined, switches: true }]);
  });

  it('does not switch a cell that stays unwritten after the step', () => {
    const motion = { ...motionOf(progress, {}), unwrittenBefore: new Set([2, 3]), unwrittenAfter: new Set([2]) };
    expect(planGridMotion(motion, VALUES)).toEqual([{ index: 3, channels: [], valueTrack: undefined, switches: true }]);
  });

  it('keeps only the props a node animates, plus its value switch', () => {
    const emphasis = linear(1, 'emphasis', 0, 1);
    const nodes = planGridMotion(motionOf(progress, { 1: [emphasis, valueTrack] }, [0xaa, 1, 9, 3]), VALUES);
    expect(nodes).toEqual([
      { index: 1, channels: [{ variable: '--cv-emphasis', tracks: [emphasis] }], valueTrack, switches: false },
      { index: 2, channels: [], valueTrack: undefined, switches: true },
    ]);
  });
});

describe('createGridMotionRunner', () => {
  it('writes a CSS variable only when its value changed', () => {
    const element = document.createElement('div');
    const setProperty = vi.spyOn(element.style, 'setProperty');
    const hold: Track = { target: at(0), prop: 'scale', keyframes: [{ at: 0, value: 2 }] };
    const runner = createGridMotionRunner(planGridMotion(motionOf(motionValue(0), { 0: [hold, linear(0, 'dx', 0, 1)] }), VALUES), 0);
    runner.attach(() => element);
    runner.paint(0);
    expect(setProperty).toHaveBeenCalledTimes(2);
    runner.paint(0.5);
    expect(setProperty).toHaveBeenCalledTimes(3);
    expect(setProperty).toHaveBeenLastCalledWith('--cv-dx', '0.5');
    runner.paint(0.5);
    expect(setProperty).toHaveBeenCalledTimes(3);
  });

  it('bumps its version only when a value switch flips', () => {
    const runner = createGridMotionRunner(planGridMotion(motionOf(motionValue(0), {}, [0x10, 1, 2, 3]), VALUES), 0);
    expect(runner.showsAfter(0)).toBe(false);
    expect(runner.showsAfter(1)).toBe(true);
    const version = runner.version;
    expect(runner.sync(0.3)).toBe(false);
    expect(runner.sync(0.5)).toBe(true);
    expect(runner.version).toBe(version + 1);
    expect(runner.showsAfter(0)).toBe(true);
  });
});

describe('ByteGrid choreography', () => {
  it('subscribes ONE progress listener per grid, however many cells animate', () => {
    const progress = motionValue(0);
    const on = vi.spyOn(progress, 'on');
    const before = VALUES.map((value) => value + 1);
    renderGrid(motionOf(progress, { 0: allProps(0), 1: allProps(1), 2: allProps(2), 3: allProps(3) }, before));
    expect(on.mock.calls.filter(([event]) => event === 'change')).toHaveLength(1);
  });

  it('adds no listener when nothing animates', () => {
    const progress = motionValue(0);
    const on = vi.spyOn(progress, 'on');
    renderGrid(motionOf(progress, {}));
    expect(on).not.toHaveBeenCalled();
  });

  it('shows the before value until the middle of the step without a value track; the label states the end value', () => {
    const progress = motionValue(0);
    const { cell } = renderGrid(motionOf(progress, {}, [0x10, 1, 2, 3]));
    expect(cell().textContent).toBe('10');
    expect(cell().getAttribute('aria-label')).toBe('row 1, column 1, value 0xaa');
    act(() => progress.set(0.49));
    expect(cell().textContent).toBe('10');
    act(() => progress.set(0.5));
    expect(cell().textContent).toBe('aa');
    act(() => progress.set(0.2));
    expect(cell().textContent).toBe('10');
  });

  it('switches the value when the value track reaches 0.5', () => {
    const progress = motionValue(0);
    const { cell } = renderGrid(motionOf(progress, { 0: [valueTrack] }, [0x10, 1, 2, 3]));
    act(() => progress.set(0.79));
    expect(cell().textContent).toBe('10');
    act(() => progress.set(0.8));
    expect(cell().textContent).toBe('aa');
  });

  it('writes track samples as CSS custom properties', () => {
    const progress = motionValue(0);
    const { cell } = renderGrid(motionOf(progress, { 0: allProps(0) }));
    expect(cell().hasAttribute('data-animated')).toBe(true);
    expect(cell(1).hasAttribute('data-animated')).toBe(false);
    expect(cell().style.getPropertyValue('--cv-emphasis')).toBe('4');
    act(() => progress.set(0.5));
    expect(['--cv-dx', '--cv-dy', '--cv-scale', '--cv-opacity', '--cv-emphasis'].map((name) => cell().style.getPropertyValue(name))).toEqual(['5', '6', '7', '8', '9']);
  });

  it('only sets the properties its tracks drive', () => {
    const { cell } = renderGrid(motionOf(motionValue(0.5), { 0: [{ target: at(0), prop: 'emphasis', keyframes: [{ at: 0, value: 1 }] }] }));
    expect(cell().style.getPropertyValue('--cv-emphasis')).toBe('1');
    expect(cell().style.getPropertyValue('--cv-dx')).toBe('');
  });

  it('does not commit React renders while the playhead moves within the same value phase', () => {
    const progress = motionValue(0.6);
    const onRender = vi.fn();
    renderLab(
      <Profiler id="grid" onRender={onRender}>
        <ByteGrid values={VALUES} shape={[1, 4]} label="State" motion={motionOf(progress, { 0: allProps(0) }, [0x10, 1, 2, 3])} />
      </Profiler>,
    );
    const commits = onRender.mock.calls.length;
    act(() => {
      progress.set(0.7);
      progress.set(0.75);
    });
    expect(onRender.mock.calls.length).toBe(commits);
    expect(screen.getAllByRole('gridcell')[0]!.style.getPropertyValue('--cv-dx')).toBe('7.5');
  });

  it('clears styles, data-animated and its listener when the motion goes away and on unmount', () => {
    const progress = motionValue(0);
    const motion = motionOf(progress, { 0: [linear(0, 'emphasis', 0, 1)] });
    const { cell, rerender, unmount, store } = renderGrid(motion);
    const inLab = (ui: ReactNode) => (
      <I18nProvider messages={vizMessages.en}>
        <LabRoot store={store}>{ui}</LabRoot>
      </I18nProvider>
    );
    const element = cell();
    rerender(inLab(<ByteGrid values={VALUES} shape={[1, 4]} label="State" />));
    expect(cell()).toBe(element);
    expect(element.hasAttribute('data-animated')).toBe(false);
    expect(element.style.getPropertyValue('--cv-emphasis')).toBe('');
    rerender(inLab(<ByteGrid values={VALUES} shape={[1, 4]} label="State" motion={motion} />));
    expect(element.hasAttribute('data-animated')).toBe(true);
    unmount();
    expect(element.hasAttribute('data-animated')).toBe(false);
    progress.set(0.5);
    expect(element.style.getPropertyValue('--cv-emphasis')).toBe('');
  });
});
