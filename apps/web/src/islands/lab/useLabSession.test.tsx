// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LabSession, ReadySession, RunOutcome } from '../../labs/labSession.ts';
import { useLabSession } from './useLabSession.ts';

const labSession = vi.hoisted(() => ({ startLab: vi.fn(), rerunLab: vi.fn() }));
vi.mock('../../labs/labSession.ts', () => labSession);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => (resolve = settle));
  return { promise, resolve };
}

/** A producer that accepts any params except those flagged `bad`. */
const producer = { validate: (params: Record<string, unknown>) => (params['bad'] ? { ok: false, error: { key: 'invalid' } } : { ok: true, value: params }) };
const ready = (tag: string) => ({ status: 'ready', params: { tag }, producer }) as unknown as ReadySession;
const ran = (tag: string): RunOutcome => ({ ok: true, session: ready(tag) });
const paramsOfRun = (index: number) => labSession.rerunLab.mock.calls[index]?.[1] as Record<string, unknown>;
const tagOf = (session: LabSession) => (session.status === 'ready' ? (session as unknown as { params: { tag: string } }).params.tag : session.status);

async function renderReady() {
  labSession.startLab.mockResolvedValueOnce(ready('start'));
  const hook = renderHook(() => useLabSession({ labId: 'lab', producerId: 'p' }));
  await waitFor(() => expect(tagOf(hook.result.current.session)).toBe('start'));
  return hook;
}

beforeEach(() => vi.clearAllMocks());

describe('useLabSession stale results', () => {
  it('ignores an earlier re-run that settles after a later one', async () => {
    const { result } = await renderReady();
    const first = deferred<RunOutcome>();
    const second = deferred<RunOutcome>();
    labSession.rerunLab.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    act(() => result.current.applyParams({ n: 1 }));
    act(() => result.current.applyParams({ n: 2 }));
    await act(async () => second.resolve(ran('second')));
    await act(async () => first.resolve(ran('first')));
    expect(tagOf(result.current.session)).toBe('second');
  });

  it('ignores a view request that settles after a later re-run', async () => {
    const { result } = await renderReady();
    const request = deferred<RunOutcome>();
    labSession.rerunLab.mockReturnValueOnce(request.promise).mockResolvedValueOnce(ran('applied'));
    act(() => result.current.requestParams({ n: 1 }));
    await act(async () => result.current.applyParams({ n: 2 }));
    await act(async () => request.resolve({ ok: false, error: { key: 'stale' } }));
    expect(tagOf(result.current.session)).toBe('applied');
    expect(result.current.requestError).toBeNull();
  });

  it('hands each re-run and view request a guard that turns false once a newer run starts', async () => {
    const { result } = await renderReady();
    labSession.rerunLab.mockReturnValue(new Promise(() => undefined));
    act(() => result.current.applyParams({ n: 1 }));
    const rerunGuard = labSession.rerunLab.mock.calls[0]?.[2] as () => boolean;
    expect(rerunGuard()).toBe(true);
    act(() => result.current.requestParams({ n: 2 }));
    const requestGuard = labSession.rerunLab.mock.calls[1]?.[2] as () => boolean;
    expect(rerunGuard()).toBe(false);
    expect(requestGuard()).toBe(true);
    labSession.startLab.mockReturnValueOnce(new Promise(() => undefined));
    act(() => result.current.reset());
    expect(requestGuard()).toBe(false);
  });

  it('ignores a re-run that settles after a reset', async () => {
    const { result } = await renderReady();
    const rerun = deferred<RunOutcome>();
    labSession.rerunLab.mockReturnValueOnce(rerun.promise);
    labSession.startLab.mockResolvedValueOnce(ready('restarted'));
    act(() => result.current.applyParams({ n: 1 }));
    await act(async () => result.current.reset());
    await waitFor(() => expect(tagOf(result.current.session)).toBe('restarted'));
    await act(async () => rerun.resolve(ran('stale')));
    expect(tagOf(result.current.session)).toBe('restarted');
  });

  it('supersedes a pending re-run as soon as reset is called, before the restart effect runs', async () => {
    const { result } = await renderReady();
    labSession.rerunLab.mockReturnValueOnce(new Promise(() => undefined));
    act(() => result.current.applyParams({ n: 1 }));
    const rerunGuard = labSession.rerunLab.mock.calls[0]?.[2] as () => boolean;
    labSession.startLab.mockReturnValueOnce(new Promise(() => undefined));
    act(() => {
      result.current.reset();
      expect(rerunGuard()).toBe(false);
    });
  });

  it('keeps loading when a re-run resolves between reset and the restart effect', async () => {
    const { result } = await renderReady();
    const rerun = deferred<RunOutcome>();
    labSession.rerunLab.mockReturnValueOnce(rerun.promise);
    act(() => result.current.applyParams({ n: 1 }));
    labSession.startLab.mockReturnValueOnce(new Promise(() => undefined));
    await act(async () => {
      result.current.reset();
      rerun.resolve(ran('stale'));
      await rerun.promise;
      await Promise.resolve();
    });
    expect(result.current.session.status).toBe('loading');
  });
});

describe('useLabSession run errors', () => {
  it('keeps the ready session (last good bundle) and reports a run error inline', async () => {
    const { result } = await renderReady();
    labSession.rerunLab.mockResolvedValueOnce({ ok: false, error: { key: 'core.error.keyLength' } });
    await act(async () => result.current.applyParams({ keyHex: '0001' }));
    expect(result.current.session.status).toBe('ready');
    expect(tagOf(result.current.session)).toBe('start');
    expect(result.current.requestError).toEqual({ key: 'core.error.keyLength' });
  });

  it('clears the run error once a later run succeeds', async () => {
    const { result } = await renderReady();
    labSession.rerunLab.mockResolvedValueOnce({ ok: false, error: { key: 'core.error.keyLength' } }).mockResolvedValueOnce(ran('fixed'));
    await act(async () => result.current.applyParams({ keyHex: '0001' }));
    await act(async () => result.current.applyParams({ keyHex: '00'.repeat(16) }));
    expect(tagOf(result.current.session)).toBe('fixed');
    expect(result.current.requestError).toBeNull();
  });

  it('keeps the ready session when a view request fails to run', async () => {
    const { result } = await renderReady();
    labSession.rerunLab.mockResolvedValueOnce({ ok: false, error: { key: 'core.error.notBlockAligned' } });
    await act(async () => result.current.requestParams({ plaintextHex: '00' }));
    expect(tagOf(result.current.session)).toBe('start');
    expect(result.current.requestError).toEqual({ key: 'core.error.notBlockAligned' });
  });

  it('settles and reports a run error when the re-run throws (e.g. while mapping the step)', async () => {
    const { result } = await renderReady();
    labSession.rerunLab.mockRejectedValueOnce(new RangeError('latestStepAt'));
    await act(async () => result.current.applyParams({ n: 1 }));
    expect(result.current.computing).toBe(false);
    expect(result.current.requestError).toEqual({ key: 'ui.lab.error.runFailed' });
    expect(tagOf(result.current.session)).toBe('start');
  });
});

describe('useLabSession edits while a run is pending', () => {
  it('merges a second view request into the first, not into the settled params', async () => {
    const { result } = await renderReady();
    labSession.rerunLab.mockReturnValue(new Promise(() => undefined));
    act(() => result.current.requestParams({ a: 1 }));
    act(() => result.current.requestParams({ b: 2 }));
    expect(paramsOfRun(1)).toEqual({ tag: 'start', a: 1, b: 2 });
  });

  it('merges a view request into params applied by a pending re-run', async () => {
    const { result } = await renderReady();
    labSession.rerunLab.mockReturnValue(new Promise(() => undefined));
    act(() => result.current.applyParams({ tag: 'start', key: 'edited' }));
    act(() => result.current.requestParams({ b: 2 }));
    expect(paramsOfRun(1)).toEqual({ tag: 'start', key: 'edited', b: 2 });
  });

  it('rejects an invalid view request without superseding the pending run', async () => {
    const { result } = await renderReady();
    labSession.rerunLab.mockReturnValueOnce(new Promise(() => undefined));
    act(() => result.current.applyParams({ n: 1 }));
    act(() => result.current.requestParams({ bad: true }));
    expect(labSession.rerunLab).toHaveBeenCalledTimes(1);
    expect((labSession.rerunLab.mock.calls[0]?.[2] as () => boolean)()).toBe(true);
    expect(result.current.requestError).toEqual({ key: 'invalid' });
  });

  it('starts merging from the fresh start params after a reset', async () => {
    const { result } = await renderReady();
    labSession.rerunLab.mockReturnValue(new Promise(() => undefined));
    act(() => result.current.requestParams({ a: 1 }));
    labSession.startLab.mockResolvedValueOnce(ready('restarted'));
    await act(async () => result.current.reset());
    await waitFor(() => expect(tagOf(result.current.session)).toBe('restarted'));
    act(() => result.current.requestParams({ b: 2 }));
    expect(paramsOfRun(1)).toEqual({ tag: 'restarted', b: 2 });
  });
});

describe('useLabSession pendingParams', () => {
  it('starts as the start params, follows each requested run before it settles and keeps a failed one', async () => {
    const { result } = await renderReady();
    expect(result.current.pendingParams).toEqual({ tag: 'start' });
    const run = deferred<RunOutcome>();
    labSession.rerunLab.mockReturnValueOnce(run.promise);
    act(() => result.current.requestParams({ a: 1 }));
    expect(result.current.pendingParams).toEqual({ tag: 'start', a: 1 });
    expect(tagOf(result.current.session)).toBe('start');
    await act(async () => run.resolve({ ok: false, error: { key: 'core.error.keyLength' } }));
    expect(result.current.pendingParams).toEqual({ tag: 'start', a: 1 });
  });

  it('is null while loading after a reset, then the fresh start params', async () => {
    const { result } = await renderReady();
    const restart = deferred<LabSession>();
    labSession.startLab.mockReturnValueOnce(restart.promise);
    act(() => result.current.reset());
    expect(result.current.pendingParams).toBeNull();
    await act(async () => restart.resolve(ready('restarted')));
    expect(result.current.pendingParams).toEqual({ tag: 'restarted' });
  });

  it('merges two view requests made in the same tick', async () => {
    const { result } = await renderReady();
    labSession.rerunLab.mockReturnValue(new Promise(() => undefined));
    act(() => {
      result.current.requestParams({ a: 1 });
      result.current.requestParams({ b: 2 });
    });
    expect(paramsOfRun(1)).toEqual({ tag: 'start', a: 1, b: 2 });
    expect(result.current.pendingParams).toEqual({ tag: 'start', a: 1, b: 2 });
  });
});

describe('useLabSession wiring', () => {
  it('starts with a per-lab runner and labHref/blockLabHref for the page locale', async () => {
    labSession.startLab.mockResolvedValueOnce(ready('start'));
    renderHook(() => useLabSession({ labId: 'lab', producerId: 'p', locale: 'de' }));
    await waitFor(() => expect(labSession.startLab).toHaveBeenCalled());
    const options = labSession.startLab.mock.calls[0]?.[0] as {
      runner: { run: unknown };
      labHref: (zoom: { producerId: string; params: Record<string, string> }) => string | undefined;
      blockLabHref: (id: string, keyHex: string, blockHex: string) => string | undefined;
    };
    expect(options.runner.run).toBeTypeOf('function');
    expect(options.labHref({ producerId: 'aes', params: {} })).toMatch(/^\/de\/lab\/aes\/#lab=aes&/);
    expect(options.blockLabHref('aes', '00'.repeat(16), '11'.repeat(16))).toMatch(/^\/de\/lab\/aes\/#lab=aes&/);
  });
});

describe('useLabSession computing', () => {
  it('is true while the latest re-run is pending and false once it settles, either way', async () => {
    const { result } = await renderReady();
    expect(result.current.computing).toBe(false);
    const first = deferred<RunOutcome>();
    const second = deferred<RunOutcome>();
    labSession.rerunLab.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    act(() => result.current.applyParams({ n: 1 }));
    expect(result.current.computing).toBe(true);
    act(() => result.current.requestParams({ n: 2 }));
    await act(async () => first.resolve(ran('superseded')));
    expect(result.current.computing).toBe(true);
    await act(async () => second.resolve({ ok: false, error: { key: 'failed' } }));
    expect(result.current.computing).toBe(false);
  });

  it('stays true when an invalid view request is reported while a re-run is pending, and keeps that error once the run succeeds', async () => {
    const { result } = await renderReady();
    const pending = deferred<RunOutcome>();
    labSession.rerunLab.mockReturnValueOnce(pending.promise);
    act(() => result.current.applyParams({ n: 1 }));
    act(() => result.current.requestParams({ bad: true }));
    expect(result.current.requestError).toEqual({ key: 'invalid' });
    expect(result.current.computing).toBe(true);
    await act(async () => pending.resolve(ran('applied')));
    expect(result.current.computing).toBe(false);
    expect(result.current.requestError).toEqual({ key: 'invalid' });
    expect(tagOf(result.current.session)).toBe('applied');
  });

  it('is false after a reset drops a pending re-run', async () => {
    const { result } = await renderReady();
    labSession.rerunLab.mockReturnValueOnce(new Promise(() => undefined));
    labSession.startLab.mockResolvedValueOnce(ready('restarted'));
    act(() => result.current.applyParams({ n: 1 }));
    await act(async () => result.current.reset());
    await waitFor(() => expect(tagOf(result.current.session)).toBe('restarted'));
    expect(result.current.computing).toBe(false);
  });
});

describe('useLabSession restart on changed props', () => {
  it('supersedes a pending re-run: its late failure neither reports an error nor keeps "computing"', async () => {
    labSession.startLab.mockResolvedValueOnce(ready('start'));
    const hook = renderHook((props: { presetId: string }) => useLabSession({ labId: 'lab', producerId: 'p', presetId: props.presetId }), { initialProps: { presetId: 'a' } });
    await waitFor(() => expect(tagOf(hook.result.current.session)).toBe('start'));
    const pending = deferred<RunOutcome>();
    labSession.rerunLab.mockReturnValueOnce(pending.promise);
    act(() => hook.result.current.applyParams({ n: 1 }));
    expect(hook.result.current.computing).toBe(true);
    labSession.startLab.mockResolvedValueOnce(ready('preset-b'));
    hook.rerender({ presetId: 'b' });
    await waitFor(() => expect(tagOf(hook.result.current.session)).toBe('preset-b'));
    await act(async () => pending.resolve({ ok: false, error: { key: 'core.error.loadFailed' } }));
    expect(hook.result.current.requestError).toBeNull();
    expect(hook.result.current.computing).toBe(false);
    expect(tagOf(hook.result.current.session)).toBe('preset-b');
  });
});
