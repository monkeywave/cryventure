// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LabSession, ParamsRequestOutcome, ReadySession, SettledLabSession } from '../../labs/labSession.ts';
import { useLabSession } from './useLabSession.ts';

const labSession = vi.hoisted(() => ({ startLab: vi.fn(), rerunLab: vi.fn(), requestLabParams: vi.fn() }));
vi.mock('../../labs/labSession.ts', () => labSession);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => (resolve = settle));
  return { promise, resolve };
}

const ready = (tag: string) => ({ status: 'ready', params: { tag } }) as unknown as ReadySession;
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
    const first = deferred<SettledLabSession>();
    const second = deferred<SettledLabSession>();
    labSession.rerunLab.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    act(() => result.current.applyParams({ n: 1 }));
    act(() => result.current.applyParams({ n: 2 }));
    await act(async () => second.resolve(ready('second')));
    await act(async () => first.resolve(ready('first')));
    expect(tagOf(result.current.session)).toBe('second');
  });

  it('ignores a view request that settles after a later re-run', async () => {
    const { result } = await renderReady();
    const request = deferred<ParamsRequestOutcome>();
    labSession.requestLabParams.mockReturnValueOnce(request.promise);
    labSession.rerunLab.mockResolvedValueOnce(ready('applied'));
    act(() => result.current.requestParams({ n: 1 }));
    await act(async () => result.current.applyParams({ n: 2 }));
    await act(async () => request.resolve({ ok: false, error: { key: 'stale' } }));
    expect(tagOf(result.current.session)).toBe('applied');
    expect(result.current.requestError).toBeNull();
  });

  it('hands each re-run and view request a guard that turns false once a newer run starts', async () => {
    const { result } = await renderReady();
    labSession.rerunLab.mockReturnValueOnce(new Promise(() => undefined));
    labSession.requestLabParams.mockReturnValueOnce(new Promise(() => undefined));
    act(() => result.current.applyParams({ n: 1 }));
    const rerunGuard = labSession.rerunLab.mock.calls[0]?.[2] as () => boolean;
    expect(rerunGuard()).toBe(true);
    act(() => result.current.requestParams({ n: 2 }));
    const requestGuard = labSession.requestLabParams.mock.calls[0]?.[2] as () => boolean;
    expect(rerunGuard()).toBe(false);
    expect(requestGuard()).toBe(true);
    labSession.startLab.mockReturnValueOnce(new Promise(() => undefined));
    act(() => result.current.reset());
    expect(requestGuard()).toBe(false);
  });

  it('ignores a re-run that settles after a reset', async () => {
    const { result } = await renderReady();
    const rerun = deferred<SettledLabSession>();
    labSession.rerunLab.mockReturnValueOnce(rerun.promise);
    labSession.startLab.mockResolvedValueOnce(ready('restarted'));
    act(() => result.current.applyParams({ n: 1 }));
    await act(async () => result.current.reset());
    await waitFor(() => expect(tagOf(result.current.session)).toBe('restarted'));
    await act(async () => rerun.resolve(ready('stale')));
    expect(tagOf(result.current.session)).toBe('restarted');
  });
});

describe('useLabSession wiring', () => {
  it('starts with a per-lab runner and a labHref for the page locale', async () => {
    labSession.startLab.mockResolvedValueOnce(ready('start'));
    renderHook(() => useLabSession({ labId: 'lab', producerId: 'p', locale: 'de' }));
    await waitFor(() => expect(labSession.startLab).toHaveBeenCalled());
    const options = labSession.startLab.mock.calls[0]?.[0] as { runner: { run: unknown }; labHref: (id: string, params: unknown) => string | undefined };
    expect(options.runner.run).toBeTypeOf('function');
    expect(options.labHref('aes', {})).toMatch(/^\/de\/lab\/aes\/#lab=aes&/);
  });
});
