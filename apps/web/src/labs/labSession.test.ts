import { describe, expect, it, vi } from 'vitest';
import type { ChoreographyModule, PrimitiveManifest } from '@cryventure/core';
import { stateSteps } from '@cryventure/viz';
import { encodeJsonBase64Url } from './base64url.ts';
import { readLabLink } from './deepLink.ts';
import { loadChoreographyModule, preloadViews, requestLabParams, rerunLab, runProducer, startLab, type ReadySession, type StartLabOptions } from './labSession.ts';
import { parseStartAt } from './startAt.ts';
import { createLabRunner } from './labRunner.ts';
import { toyComposite, toyProducers } from './testProducers.ts';

const C1 = { keyHex: '000102030405060708090a0b0c0d0e0f', plaintextHex: '00112233445566778899aabbccddeeff', detail: 'op' };
const C1_CIPHERTEXT = [0x69, 0xc4, 0xe0, 0xd8, 0x6a, 0x7b, 0x04, 0x30, 0xd8, 0xcd, 0xb7, 0x80, 0x70, 0xb4, 0xc5, 0x5a];

async function readyAes(link = readLabLink('', 'x'), extra: Partial<StartLabOptions> = {}): Promise<ReadySession> {
  const session = await startLab({ producerId: 'aes', presetId: 'fips197-c1', link, ...extra });
  if (session.status !== 'ready') throw new Error(`expected ready, got ${JSON.stringify(session)}`);
  return session;
}

describe('runProducer', () => {
  it('turns a failing import into a localized error', async () => {
    const broken = { load: () => Promise.reject(new Error('offline')) } as unknown as PrimitiveManifest;
    expect(await runProducer(broken, {})).toEqual({ ok: false, error: { key: 'ui.lab.error.loadFailed' } });
  });
});

const choreographyModule: ChoreographyModule = { choreograph: () => undefined };

describe('loadChoreographyModule', () => {
  it('resolves the loaded module', async () => {
    await expect(loadChoreographyModule({ loadChoreography: async () => choreographyModule })).resolves.toBe(choreographyModule);
  });

  it('resolves undefined without a loader', async () => {
    await expect(loadChoreographyModule({})).resolves.toBeUndefined();
  });

  it('resolves undefined when the import rejects', async () => {
    await expect(loadChoreographyModule({ loadChoreography: () => Promise.reject(new Error('chunk failed')) })).resolves.toBeUndefined();
  });
});

describe('preloadViews', () => {
  it('loads every view and tolerates a failed chunk', async () => {
    const ok = vi.fn(async () => ({ default: () => null }));
    const broken = vi.fn(() => Promise.reject(new Error('chunk failed')));
    await expect(preloadViews([{ load: ok }, { load: broken }])).resolves.toBeUndefined();
    expect(ok).toHaveBeenCalledTimes(1);
    expect(broken).toHaveBeenCalledTimes(1);
  });
});

describe('startLab', () => {
  it('loads the producer, its choreography and the views before the session is ready', async () => {
    const session = await readyAes();
    expect(session.choreography).toBeDefined();
    expect(session.choreography?.choreograph).toBeTypeOf('function');
  });

  it('starts the producer, choreography and view loads together (no waterfall)', async () => {
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const track = <T>(name: string, value: T) => async () => {
      started.push(name);
      await gate;
      return value;
    };
    const producer = {
      id: 'p',
      facets: ['state'],
      presets: [],
      defaults: {},
      validate: (params: unknown) => ({ ok: true, value: params }),
      load: track('producer', { run: () => ({ ok: false, error: { key: 'x' } }) }),
      loadChoreography: track('choreography', choreographyModule),
    } as unknown as PrimitiveManifest;
    const view = { id: 'v', requires: ['state'], load: track('view', { default: () => null }) };
    const registries = {
      producers: { get: () => producer },
      views: { list: () => [view] },
    } as unknown as StartLabOptions['registries'];
    const pending = startLab({ producerId: 'p', link: { status: 'absent' }, registries });
    await Promise.resolve();
    expect(started.sort()).toEqual(['choreography', 'producer', 'view']);
    release();
    expect(await pending).toEqual({ status: 'error', error: { key: 'x' } });
  });

  it('runs the FIPS 197 C.1 preset and starts at the initial state', async () => {
    const session = await readyAes();
    expect(session.store.getState().step).toBe(-1);
    expect(session.store.getState().bundle?.output['ciphertext']).toEqual(C1_CIPHERTEXT);
    expect(session.views.map((view) => view.id)).toEqual(expect.arrayContaining(['state', 'narration']));
    expect(session.notice).toBe(false);
  });

  it('restores params and step from a deep link', async () => {
    const params = { ...C1, keyHex: '2b7e151628aed2a6abf7158809cf4f3c' };
    const session = await readyAes(readLabLink(`lab=x&p=${encodeJsonBase64Url(params)}&s=5&v=1`, 'x'));
    expect(session.params['keyHex']).toBe(params.keyHex);
    expect(session.store.getState().step).toBe(5);
  });

  it('clamps an out-of-range step', async () => {
    const session = await readyAes(readLabLink('lab=x&s=9999&v=1', 'x'));
    expect(session.store.getState().step).toBe(stateSteps(session.store.getState().bundle).length - 1);
  });

  it('clamps an out-of-range startAt step via the store', async () => {
    const session = await readyAes(undefined, { startAt: parseStartAt('step:9999') });
    expect(session.store.getState().step).toBe(stateSteps(session.store.getState().bundle).length - 1);
  });

  it('flags an invalid link and uses the preset', async () => {
    const session = await readyAes(readLabLink('lab=x&p=@@&v=1', 'x'));
    expect(session.notice).toBe(true);
    expect(session.params).toEqual(C1);
  });

  it('opens at startAt (first step of round 1 SubBytes) in the preselected mode without playing', async () => {
    const session = await readyAes(undefined, { startAt: parseStartAt('round:1,op:subBytes'), mode: 'story' });
    const state = session.store.getState();
    const step = state.bundle?.facets['state@default'] as { steps: { op: string; round: number }[] };
    expect(step.steps[state.step]).toMatchObject({ op: 'subBytes', round: 1 });
    expect(state.step).toBe(step.steps.findIndex((candidate) => candidate.op === 'subBytes'));
    expect(state.mode).toBe('story');
    expect(state.playing).toBe(false);
  });

  it("lets the deep link's step win over startAt", async () => {
    const session = await readyAes(readLabLink('lab=x&s=5&v=1', 'x'), { startAt: parseStartAt('round:1,op:subBytes') });
    expect(session.store.getState().step).toBe(5);
  });

  it('reports an unknown producer', async () => {
    expect(await startLab({ producerId: 'nope', link: { status: 'absent' } })).toEqual({
      status: 'error',
      error: { key: 'ui.lab.error.unknownProducer', params: { id: 'nope' } },
    });
  });
});

describe('rerunLab', () => {
  it('swaps the bundle and keeps the step', async () => {
    const session = await readyAes();
    session.store.getState().seek(3);
    const next = await rerunLab(session, { ...C1, plaintextHex: '00'.repeat(16) });
    expect(next.status).toBe('ready');
    expect(session.store.getState().step).toBe(3);
    expect(session.store.getState().bundle?.output['ciphertext']).not.toEqual(C1_CIPHERTEXT);
  });

  it('returns an error session for bad params and leaves the store untouched', async () => {
    const session = await readyAes();
    expect(await rerunLab(session, { ...C1, keyHex: '00' })).toEqual({
      status: 'error',
      error: { key: 'plugin.aes.error.keyLength', params: { length: 1 } },
    });
    expect(session.store.getState().bundle?.output['ciphertext']).toEqual(C1_CIPHERTEXT);
  });
});

describe('rerunLab with a superseded run', () => {
  /** Mimics `useRunGuard`: each call starts a run whose `isCurrent` turns false once the next one starts. */
  function runGuard() {
    let latest = 0;
    return () => {
      const run = ++latest;
      return () => run === latest;
    };
  }

  /** The session with a producer whose module loads only when the returned `release(i)` is called for load `i`. */
  function gated(session: ReadySession) {
    const gates: (() => void)[] = [];
    const load = async () => {
      await new Promise<void>((resolve) => gates.push(resolve));
      return session.producer.load();
    };
    return { session: { ...session, producer: { ...session.producer, load } }, release: (index: number) => gates[index]?.() };
  }

  it('does not touch the store when a newer run started meanwhile', async () => {
    const { session, release } = gated(await readyAes());
    const beginRun = runGuard();
    const older = rerunLab(session, { ...C1, plaintextHex: '00'.repeat(16) }, beginRun());
    const newer = rerunLab(session, { ...C1, plaintextHex: '11'.repeat(16) }, beginRun());
    await Promise.resolve();
    release(1);
    await newer;
    const newerBundle = session.store.getState().bundle;
    release(0);
    await older;
    expect(session.store.getState().bundle).toBe(newerBundle);
  });

  it('leaves the store untouched when the run is no longer current', async () => {
    const session = await readyAes();
    const bundle = session.store.getState().bundle;
    await rerunLab(session, { ...C1, plaintextHex: '00'.repeat(16) }, () => false);
    expect(session.store.getState().bundle).toBe(bundle);
  });

  it('requestLabParams passes the guard through', async () => {
    const session = await readyAes();
    const bundle = session.store.getState().bundle;
    await requestLabParams(session, { plaintextHex: '00'.repeat(16) }, () => false);
    expect(session.store.getState().bundle).toBe(bundle);
  });
});

describe('rerunLab keeps the debugger context', () => {
  const firstIndex = (session: ReadySession, predicate: (step: { op: string; round: number }) => boolean) =>
    (stateSteps(session.store.getState().bundle) as unknown as { op: string; round: number }[]).findIndex(predicate);

  it('keeps breakpoints whose op still occurs and the watched cell when it still exists', async () => {
    const session = await readyAes();
    session.store.getState().toggleBreakpoint('mixColumns');
    session.store.getState().selectNode({ region: 'state', index: 5 });
    await rerunLab(session, { ...C1, plaintextHex: '00'.repeat(16) });
    expect(session.store.getState().breakpoints).toEqual(['mixColumns']);
    expect(session.store.getState().selection.node).toEqual({ region: 'state', index: 5 });
  });

  it('drops breakpoints on ops the new trace lacks and a watched cell outside its region', async () => {
    const session = await readyAes();
    session.store.getState().toggleBreakpoint('mixColumns');
    session.store.getState().selectNode({ region: 'state', index: 99 });
    await rerunLab(session, { ...C1, detail: 'round' });
    expect(session.store.getState().breakpoints).toEqual([]);
    expect(session.store.getState().selection.node).toBeNull();
  });

  it('maps the playhead by meaning: op-level round 7 → the round-7 step at round detail', async () => {
    const session = await readyAes();
    session.store.getState().seek(firstIndex(session, (step) => step.round === 7 && step.op === 'mixColumns'));
    await rerunLab(session, { ...C1, detail: 'round' });
    expect(firstIndex(session, (step) => step.round === 7)).toBe(session.store.getState().step);
  });
});

describe('requestLabParams', () => {
  it('merges the patch, validates (normalising) and re-runs keeping the step', async () => {
    const session = await readyAes();
    session.store.getState().seek(3);
    const outcome = await requestLabParams(session, { plaintextHex: '00 '.repeat(16) });
    const expected = { ...C1, plaintextHex: '00'.repeat(16) };
    expect(outcome).toMatchObject({ ok: true, session: { status: 'ready', params: expected } });
    expect(session.store.getState().step).toBe(3);
    expect(session.store.getState().bundle?.output['ciphertext']).not.toEqual(C1_CIPHERTEXT);
  });

  it('rejects an invalid patch with the validation error and leaves the store untouched', async () => {
    const session = await readyAes();
    const bundle = session.store.getState().bundle;
    expect(await requestLabParams(session, { keyHex: 'zz' })).toEqual({ ok: false, error: { key: 'core.error.hexInvalidChar', params: { char: 'z', index: 0 } } });
    expect(session.store.getState().bundle).toBe(bundle);
  });
});

describe('startLab / rerunLab with ports and a runner', () => {
  const registries = { producers: toyProducers, views: { list: () => [] } } as unknown as StartLabOptions['registries'];
  const toyStart = (extra: Partial<StartLabOptions> = {}) => startLab({ producerId: 'toy-mode', link: { status: 'absent' }, registries, ...extra });

  it('prepares the ports of the start params against the given producers', async () => {
    const session = await toyStart();
    expect(session.status === 'ready' && session.store.getState().bundle?.output).toEqual({ cipher: [1] });
  });

  it('re-runs through the session runner, preparing the ports of the new params', async () => {
    const session = await toyStart();
    if (session.status !== 'ready') throw new Error('expected ready');
    const run = vi.spyOn(session.runner, 'run');
    expect(await rerunLab(session, { cipher: 'nope' })).toEqual({ status: 'error', error: { key: 'core.error.portMissing', params: { id: 'nope' } } });
    expect(run).toHaveBeenCalledWith(toyComposite, { cipher: 'nope' });
  });

  it('uses the given runner and wires labHref into the store', async () => {
    const runner = createLabRunner(undefined, toyProducers);
    const labHref = vi.fn(() => '/en/lab/toy/');
    const session = await toyStart({ runner, labHref });
    if (session.status !== 'ready') throw new Error('expected ready');
    expect(session.runner).toBe(runner);
    expect(session.store.getState().labHref?.('toy', {})).toBe('/en/lab/toy/');
  });
});
