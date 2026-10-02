import { describe, expect, it, vi } from 'vitest';
import type { ChoreographyModule, PrimitiveManifest } from '@cryventure/core';
import { stateSteps } from '@cryventure/viz';
import { encodeJsonBase64Url } from './base64url.ts';
import { readLabLink } from './deepLink.ts';
import { loadChoreographyModule, preloadViews, rerunLab, runProducer, startLab, type ReadySession, type StartLabOptions } from './labSession.ts';
import { parseStartAt } from './startAt.ts';

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
