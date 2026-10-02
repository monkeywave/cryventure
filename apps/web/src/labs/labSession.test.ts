import { describe, expect, it } from 'vitest';
import type { PrimitiveManifest } from '@cryventure/core';
import { encodeJsonBase64Url } from './base64url.ts';
import { readLabLink } from './deepLink.ts';
import { rerunLab, runProducer, startLab, type ReadySession } from './labSession.ts';

const C1 = { keyHex: '000102030405060708090a0b0c0d0e0f', plaintextHex: '00112233445566778899aabbccddeeff', detail: 'op' };
const C1_CIPHERTEXT = [0x69, 0xc4, 0xe0, 0xd8, 0x6a, 0x7b, 0x04, 0x30, 0xd8, 0xcd, 0xb7, 0x80, 0x70, 0xb4, 0xc5, 0x5a];

async function readyAes(link = readLabLink('', 'x')): Promise<ReadySession> {
  const session = await startLab({ producerId: 'aes', presetId: 'fips197-c1', link });
  if (session.status !== 'ready') throw new Error(`expected ready, got ${JSON.stringify(session)}`);
  return session;
}

describe('runProducer', () => {
  it('turns a failing import into a localized error', async () => {
    const broken = { load: () => Promise.reject(new Error('offline')) } as unknown as PrimitiveManifest;
    expect(await runProducer(broken, {})).toEqual({ ok: false, error: { key: 'ui.lab.error.loadFailed' } });
  });
});

describe('startLab', () => {
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
    expect(session.store.getState().step).toBe(session.store.getState().stepCount - 1);
  });

  it('flags an invalid link and uses the preset', async () => {
    const session = await readyAes(readLabLink('lab=x&p=@@&v=1', 'x'));
    expect(session.notice).toBe(true);
    expect(session.params).toEqual(C1);
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
    expect('status' in next && next.status).toBe('ready');
    expect(session.store.getState().step).toBe(3);
    expect(session.store.getState().bundle?.output['ciphertext']).not.toEqual(C1_CIPHERTEXT);
  });

  it('returns the run error for bad params', async () => {
    const session = await readyAes();
    expect(await rerunLab(session, { ...C1, keyHex: '00' })).toEqual({ key: 'plugin.aes.error.keyLength', params: { length: 1 } });
  });
});
