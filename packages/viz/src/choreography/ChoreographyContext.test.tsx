import { act, render, screen } from '@testing-library/react';
import { Profiler, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_STEP_DURATION, type Beat, type ChoreographyModule, type StepChoreography } from '@cryventure/core';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { vizMessages } from '../i18n/messages.ts';
import { createLabStore, type LabStore } from '../lab/createLabStore.ts';
import { LabRoot } from '../lab/LabRoot.tsx';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { createManualScheduler } from '../testing/manualScheduler.ts';
import { useActiveBeat, useChoreography, useFocusBeat, useStepProgress } from './ChoreographyContext.tsx';

const custom: StepChoreography = {
  duration: 2,
  tracks: [],
  beats: [
    { at: 0, narration: { key: 'beat.start' } },
    { at: 0.5, narration: { key: 'beat.middle' } },
  ],
};

/** Choreographs only the `sub` step; every other step falls back. */
const subOnly: ChoreographyModule = { choreograph: (context) => (context.step.op === 'sub' ? custom : undefined) };

function renderInLab(ui: ReactNode, { store = createLabStore(createFixtureBundle()), module }: { store?: LabStore; module?: ChoreographyModule } = {}) {
  const scheduler = createManualScheduler();
  const result = render(
    <I18nProvider messages={vizMessages.en}>
      <LabRoot store={store} choreography={module} scheduler={scheduler}>
        {ui}
      </LabRoot>
    </I18nProvider>,
  );
  return { ...result, store, scheduler };
}

/** Targets of the fallback's emphasis pulses (each also has a matching `value` flip track). */
const pulseTargets = (choreography: StepChoreography | undefined) =>
  choreography?.tracks.filter((track) => track.prop === 'emphasis').map((track) => track.target);

describe('useChoreography', () => {
  const seen: (StepChoreography | undefined)[] = [];
  function Probe() {
    seen.push(useChoreography());
    return null;
  }
  const latest = () => seen.at(-1);

  it('is undefined at the initial step', () => {
    seen.length = 0;
    renderInLab(<Probe />, { module: subOnly });
    expect(latest()).toBeUndefined();
  });

  it("returns the module's choreography for the current step and the fallback otherwise", () => {
    seen.length = 0;
    const { store } = renderInLab(<Probe />, { module: subOnly });
    act(() => store.getState().seek(1));
    expect(latest()).toBe(custom);
    act(() => store.getState().seek(0));
    const fallback = latest();
    expect(fallback).not.toBe(custom);
    expect(fallback?.beats).toEqual([{ at: 0, narration: { key: 'fixture.narration.load' } }]);
    // One emphasis pulse + one value flip per changed cell.
    expect(fallback?.tracks).toHaveLength(32);
  });

  it('uses the generic fallback without a module', () => {
    seen.length = 0;
    const { store } = renderInLab(<Probe />);
    act(() => store.getState().seek(1));
    expect(latest()?.beats[0]?.narration).toEqual({ key: 'fixture.narration.sub', params: { count: 2 } });
    expect(pulseTargets(latest())).toEqual([
      { region: 'state', index: 0 },
      { region: 'state', index: 1 },
    ]);
  });

  it('falls back when the module throws', () => {
    seen.length = 0;
    const throwing: ChoreographyModule = {
      choreograph: () => {
        throw new Error('boom');
      },
    };
    const { store } = renderInLab(<Probe />, { module: throwing });
    act(() => store.getState().seek(2));
    expect(latest()?.duration).toBe(DEFAULT_STEP_DURATION);
    expect(pulseTargets(latest())).toEqual([{ region: 'w', index: 16 }]);
  });

  it('is memoised per step: re-renders and revisits return the same object, computed once', () => {
    seen.length = 0;
    const choreograph = vi.fn(subOnly.choreograph);
    const { store } = renderInLab(<Probe />, { module: { choreograph } });
    act(() => store.getState().seek(1));
    const first = latest();
    act(() => store.getState().progress.set(0.5));
    act(() => store.getState().seek(2));
    act(() => store.getState().seek(1));
    expect(latest()).toBe(first);
    expect(choreograph.mock.calls.filter(([context]) => context.step.op === 'sub')).toHaveLength(1);
  });

  it('is undefined without a state facet', () => {
    seen.length = 0;
    const bundle = createFixtureBundle();
    const store = createLabStore({ ...bundle, facets: { 'narration@default': bundle.facets['narration@default'] } });
    renderInLab(<Probe />, { store, module: subOnly });
    act(() => store.getState().seek(1));
    expect(latest()).toBeUndefined();
  });
});

describe('useActiveBeat', () => {
  function BeatProbe({ choreography, onRender }: { choreography: StepChoreography | undefined; onRender: () => void }) {
    const beat = useActiveBeat(choreography);
    onRender();
    return <span data-testid="beat">{beat?.narration?.key ?? 'none'}</span>;
  }
  const beatText = () => screen.getByTestId('beat').textContent;

  it('re-renders only when the playhead crosses a beat boundary', () => {
    const onRender = vi.fn();
    const { store } = renderInLab(<BeatProbe choreography={custom} onRender={onRender} />);
    const progress = store.getState().progress;
    expect(beatText()).toBe('beat.middle');
    act(() => progress.set(0));
    expect(beatText()).toBe('beat.start');
    const renders = onRender.mock.calls.length;
    act(() => {
      progress.set(0.1);
    });
    act(() => {
      progress.set(0.3);
    });
    act(() => {
      progress.set(0.49);
    });
    expect(onRender.mock.calls.length).toBe(renders);
    act(() => progress.set(0.5));
    expect(beatText()).toBe('beat.middle');
    expect(onRender.mock.calls.length).toBe(renders + 1);
    act(() => progress.set(0.9));
    expect(onRender.mock.calls.length).toBe(renders + 1);
  });

  it('has no active beat before the first one or without a choreography', () => {
    const late: StepChoreography = { duration: 1, tracks: [], beats: [{ at: 0.4, narration: { key: 'late' } } satisfies Beat] };
    const { store, rerender } = renderInLab(<BeatProbe choreography={late} onRender={() => {}} />);
    act(() => store.getState().progress.set(0.2));
    expect(beatText()).toBe('none');
    act(() => store.getState().progress.set(0.4));
    expect(beatText()).toBe('late');
    rerender(
      <I18nProvider messages={vizMessages.en}>
        <LabRoot store={store}>
          <BeatProbe choreography={undefined} onRender={() => {}} />
        </LabRoot>
      </I18nProvider>,
    );
    expect(beatText()).toBe('none');
  });

  it('commits nothing per frame', () => {
    const onRender = vi.fn();
    const { store } = renderInLab(
      <Profiler id="beat" onRender={onRender}>
        <BeatProbe choreography={custom} onRender={() => {}} />
      </Profiler>,
    );
    const commits = onRender.mock.calls.length;
    act(() => {
      for (let frame = 60; frame <= 100; frame++) store.getState().progress.set(frame / 100);
    });
    expect(onRender.mock.calls.length).toBe(commits);
  });
});

describe('useFocusBeat', () => {
  function FocusProbe({ choreography }: { choreography: StepChoreography | undefined }) {
    return <span data-testid="focus">{useFocusBeat(choreography)?.narration?.key ?? 'none'}</span>;
  }
  const focusText = () => screen.getByTestId('focus').textContent;

  it('follows the active beat while the step is in flight and clears once it finishes', () => {
    const { store } = renderInLab(<FocusProbe choreography={custom} />);
    const progress = store.getState().progress;
    expect(focusText()).toBe('none');
    act(() => progress.set(0.2));
    expect(focusText()).toBe('beat.start');
    act(() => progress.set(0.7));
    expect(focusText()).toBe('beat.middle');
    act(() => progress.set(1));
    expect(focusText()).toBe('none');
  });

  it('is cleared by an exact jump (seek) and set again by an animated advance', () => {
    const store = createLabStore(createFixtureBundle());
    store.getState().setMode('story');
    const { scheduler } = renderInLab(<FocusProbe choreography={custom} />, { store });
    act(() => store.getState().next());
    expect(store.getState().progress.get()).toBe(0);
    expect(focusText()).toBe('beat.start');
    act(() => scheduler.advance(1000));
    expect(focusText()).toBe('beat.middle');
    act(() => store.getState().seek(2));
    expect(focusText()).toBe('none');
  });

  it('is undefined without a choreography', () => {
    const { store } = renderInLab(<FocusProbe choreography={undefined} />);
    act(() => store.getState().progress.set(0.5));
    expect(focusText()).toBe('none');
  });
});

describe('useStepProgress', () => {
  it("returns the store's progress motion value", () => {
    let progress: unknown;
    function Probe() {
      progress = useStepProgress();
      return null;
    }
    const { store } = renderInLab(<Probe />);
    expect(progress).toBe(store.getState().progress);
  });
});
