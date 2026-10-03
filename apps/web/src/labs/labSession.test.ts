import { describe, expect, it, vi } from 'vitest';
import type { ChoreographyModule, DeriverManifest, PrimitiveManifest, TraceBundle } from '@cryventure/core';
import { ecbManifest } from '@cryventure/primitives/ecb';
import { stateSteps, type ReactViewManifest } from '@cryventure/viz';
import { encodeJsonBase64Url } from './base64url.ts';
import { readLabLink } from './deepLink.ts';
import { loadChoreographyModule, preloadViews, requestLabParams, rerunLab, runProducer, sameViewsOr, startLab, type ReadySession, type StartLabOptions } from './labSession.ts';
import { parseStartAt } from './startAt.ts';
import { createLabRunner } from './labRunner.ts';
import { toyComposite, toyProducers } from './testProducers.ts';
import { buildRegistry, defaultRegistries, producerRegistry } from './registry.ts';

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
      derivers: [],
    } as unknown as StartLabOptions['registries'];
    const pending = startLab({ producerId: 'p', link: { status: 'absent' }, registries });
    await Promise.resolve();
    expect(started.sort()).toEqual(['choreography', 'producer', 'view']);
    release();
    expect(await pending).toEqual({ status: 'error', error: { key: 'x' } });
  });

  describe('preloads only the views the run can feed', () => {
    const DERIVED_ONLY = ['instructions', 'memory', 'registers'];
    /** The app's registries with every view's chunk load counted. */
    function countingRegistries() {
      const loaded = new Set<string>();
      const views = defaultRegistries.views.list().map((view) => ({
        ...view,
        load: () => {
          loaded.add(view.id);
          return view.load();
        },
      }));
      const registries = { ...defaultRegistries, views: buildRegistry('views', views) };
      return { loaded, registries };
    }

    it('skips derived views no deriver applies to (ctr)', async () => {
      const { loaded, registries } = countingRegistries();
      const session = await startLab({ producerId: 'ctr', link: { status: 'absent' }, registries });
      expect(session.status).toBe('ready');
      expect(DERIVED_ONLY.filter((id) => loaded.has(id))).toEqual([]);
      expect(loaded.size).toBeGreaterThan(0);
    });

    it('loads the derived views of an applicable deriver (aes at op detail)', async () => {
      const { loaded, registries } = countingRegistries();
      await startLab({ producerId: 'aes', presetId: 'fips197-c1', link: { status: 'absent' }, registries });
      expect(DERIVED_ONLY.filter((id) => loaded.has(id))).toEqual(DERIVED_ONLY);
    });
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

  it('starts with the lesson\'s preferred variant (lab-wide), none by default', async () => {
    expect((await readyAes(undefined, { variant: 'x86_64-aesni' })).store.getState().preferredVariants).toEqual(['x86_64-aesni']);
    expect((await readyAes()).store.getState().preferredVariants).toEqual([]);
  });

  it("lets the deep link's step win over startAt", async () => {
    const session = await readyAes(readLabLink('lab=x&s=5&v=1', 'x'), { startAt: parseStartAt('round:1,op:subBytes') });
    expect(session.store.getState().step).toBe(5);
  });

  it('falls back to the preset with a notice when valid-looking link params fail at run time', async () => {
    const preset = ecbManifest.presets[0]!;
    const link = readLabLink(`lab=ecb&p=${encodeJsonBase64Url({ ...preset.params, keyHex: '0001020304' })}&s=5&v=1`, 'ecb');
    const session = await startLab({ producerId: 'ecb', presetId: preset.id, link });
    expect(session).toMatchObject({ status: 'ready', notice: true, params: preset.params });
    if (session.status !== 'ready') return;
    expect(session.store.getState().step).toBe(-1);
  });

  it('keeps the error session when the preset fallback fails too', async () => {
    const producer = {
      id: 'p',
      facets: ['state'],
      presets: [],
      defaults: { n: 0 },
      validate: (params: unknown) => ({ ok: true, value: params }),
      load: async () => ({ run: () => ({ ok: false, error: { key: 'x' } }) }),
    } as unknown as PrimitiveManifest;
    const registries = { producers: { get: () => producer }, views: { list: () => [] }, derivers: [] } as unknown as StartLabOptions['registries'];
    const link = readLabLink(`lab=p&p=${encodeJsonBase64Url({ n: 1 })}&v=1`, 'p');
    expect(await startLab({ producerId: 'p', link, registries })).toEqual({ status: 'error', error: { key: 'x' } });
  });

  describe('when the preset/defaults object is handed out as a copy', () => {
    /** A producer whose `defaults` is a fresh copy on every read and whose runs always fail (each run's params are recorded). */
    function copyingProducer() {
      const runs: unknown[] = [];
      const producer = {
        id: 'p',
        facets: ['state'],
        presets: [],
        get defaults() {
          return { n: 0 };
        },
        validate: (params: unknown) => ({ ok: true, value: { ...(params as object) } }),
        load: async () => ({
          run: (params: { n: number }) => {
            runs.push(params);
            return { ok: false, error: { key: 'x' } };
          },
        }),
      } as unknown as PrimitiveManifest;
      const registries = { producers: { get: () => producer }, views: { list: () => [] }, derivers: [] } as unknown as StartLabOptions['registries'];
      return { runs, registries };
    }

    it('still falls back when link params fail at run time', async () => {
      const { runs, registries } = copyingProducer();
      const link = readLabLink(`lab=p&p=${encodeJsonBase64Url({ n: 1 })}&v=1`, 'p');
      await startLab({ producerId: 'p', link, registries });
      expect(runs).toEqual([{ n: 1 }, { n: 0 }]);
    });

    it('attempts no fallback when the failing params did not come from the link', async () => {
      const { runs, registries } = copyingProducer();
      expect(await startLab({ producerId: 'p', link: { status: 'absent' }, registries })).toEqual({ status: 'error', error: { key: 'x' } });
      expect(runs).toEqual([{ n: 0 }]);
    });
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
    expect(next).toMatchObject({ ok: true, session: { status: 'ready', params: { plaintextHex: '00'.repeat(16) } } });
    expect(session.store.getState().step).toBe(3);
    expect(session.store.getState().bundle?.output['ciphertext']).not.toEqual(C1_CIPHERTEXT);
  });

  it('reports a run error without an error session and leaves the store untouched', async () => {
    const session = await readyAes();
    expect(await rerunLab(session, { ...C1, keyHex: '00' })).toEqual({
      ok: false,
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
  const registries = { producers: toyProducers, views: { list: () => [] }, derivers: [] } as unknown as StartLabOptions['registries'];
  const toyStart = (extra: Partial<StartLabOptions> = {}) => startLab({ producerId: 'toy-mode', link: { status: 'absent' }, registries, ...extra });

  it('prepares the ports of the start params against the given producers', async () => {
    const session = await toyStart();
    expect(session.status === 'ready' && session.store.getState().bundle?.output).toEqual({ cipher: [1] });
  });

  it('re-runs through the session runner, preparing the ports of the new params', async () => {
    const session = await toyStart();
    if (session.status !== 'ready') throw new Error('expected ready');
    const run = vi.spyOn(session.runner, 'run');
    expect(await rerunLab(session, { cipher: 'nope' })).toEqual({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'nope' } } });
    expect(run).toHaveBeenCalledWith(toyComposite, { cipher: 'nope' });
  });

  it('requestLabParams reports a run error of a valid patch like a validation error', async () => {
    const session = await toyStart();
    if (session.status !== 'ready') throw new Error('expected ready');
    const bundle = session.store.getState().bundle;
    expect(await requestLabParams(session, { cipher: 'nope' })).toEqual({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'nope' } } });
    expect(session.store.getState().bundle).toBe(bundle);
  });

  it('uses the given runner and wires labHref into the store', async () => {
    const runner = createLabRunner({ producers: toyProducers });
    const labHref = vi.fn(() => '/en/lab/toy/');
    const session = await toyStart({ runner, labHref });
    if (session.status !== 'ready') throw new Error('expected ready');
    expect(session.runner).toBe(runner);
    expect(session.store.getState().labHref?.('toy', {})).toBe('/en/lab/toy/');
  });
});

describe('startLab / rerunLab view list with derivers', () => {
  const view = (id: string, requires: string[]) => ({ kind: 'view' as const, id, apiVersion: 1 as const, titleKey: `view.${id}.title`, icon: 'x', requires, load: async () => ({ default: () => null }) });
  const opDetailOnly: DeriverManifest = {
    kind: 'deriver',
    id: 'demo',
    apiVersion: 1,
    from: ['state'],
    provides: ['demo'],
    appliesTo: (bundle: TraceBundle) => (bundle.params as { detail?: string }).detail === 'op',
    load: async () => ({ derive: () => ({}) }),
  };
  const registries = { producers: producerRegistry, views: buildRegistry('v', [view('state', ['state']), view('demo', ['demo'])]), derivers: [opDetailOnly] };
  const ids = (session: ReadySession) => session.views.map((entry) => entry.id);

  it('offers derived views the bundle can feed, and recomputes them after every re-run', async () => {
    const session = await readyAes(readLabLink('', 'x'), { registries });
    expect(ids(session)).toEqual(['demo', 'state']);
    expect(session.derivers).toEqual([opDetailOnly]);

    const roundDetail = await rerunLab(session, { ...C1, detail: 'round' });
    if (!roundDetail.ok) throw new Error('expected ok');
    expect(ids(roundDetail.session)).toEqual(['state']);

    const back = await rerunLab(roundDetail.session, C1);
    expect(back.ok && ids(back.session)).toEqual(['demo', 'state']);
  });

  it('keeps the same views array when a re-run offers the same view ids (no workspace re-render)', async () => {
    const session = await readyAes(readLabLink('', 'x'), { registries });
    const same = await rerunLab(session, { ...C1, plaintextHex: '00'.repeat(16) });
    if (!same.ok) throw new Error('expected ok');
    expect(same.session.views).toBe(session.views);

    const changed = await rerunLab(same.session, { ...C1, detail: 'round' });
    if (!changed.ok) throw new Error('expected ok');
    expect(changed.session.views).not.toBe(session.views);
  });
});

describe('sameViewsOr', () => {
  const view = (id: string) => ({ id }) as unknown as ReactViewManifest;

  it('keeps the previous array when the ids and their order are unchanged', () => {
    const previous = [view('state'), view('narration')];
    expect(sameViewsOr(previous, [view('state'), view('narration')])).toBe(previous);
    const none: ReactViewManifest[] = [];
    expect(sameViewsOr(none, [])).toBe(none);
  });

  it('takes the next array when a view is added, removed or reordered', () => {
    const previous = [view('state'), view('narration')];
    for (const next of [[view('state'), view('narration'), view('memory')], [view('state')], [view('narration'), view('state')], [view('state'), view('memory')]])
      expect(sameViewsOr(previous, next)).toBe(next);
  });
});
