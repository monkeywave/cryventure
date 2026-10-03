import { Registry, bytesEqual, pkcs7Pad, type PrimitiveManifest } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { describe, expect, it } from 'vitest';
import { runPenguinJob, type PenguinRequest } from './penguinJob.ts';
import { countRepeatedBlocks } from './pixels.ts';

const BLOCK = 16;

function producers(): Registry<PrimitiveManifest> {
  const registry = new Registry<PrimitiveManifest>('producers');
  primitiveManifests.forEach((manifest) => registry.register(manifest));
  return registry;
}

/**
 * 32 pixels of one flat colour = 96 RGB bytes = 6 blocks. A pixel is 3 bytes and a block 16, so the
 * byte pattern repeats every 48 bytes: blocks 0–2 are three different 16-byte runs, and blocks 3–5
 * repeat them exactly.
 */
function flatImageRgb(): Uint8Array {
  const run = new Uint8Array(96);
  for (let i = 0; i < run.length; i += 3) run.set([20, 30, 40], i);
  return run;
}

function request(overrides: Partial<PenguinRequest> = {}): PenguinRequest {
  return { id: 7, mode: 'ecb', key: new Uint8Array(16).fill(0x2b), iv: new Uint8Array(16).fill(0x01), rgb: flatImageRgb(), ...overrides };
}

const block = (bytes: Uint8Array, index: number) => bytes.subarray(index * BLOCK, (index + 1) * BLOCK);

async function ciphertextOf(overrides: Partial<PenguinRequest>): Promise<Uint8Array> {
  const response = await runPenguinJob(request(overrides), producers());
  if (!response.ok) throw new Error(response.error.key);
  return response.ciphertext;
}

describe('runPenguinJob', () => {
  it('ECB: identical 16-byte pixel runs give identical ciphertext blocks', async () => {
    const ciphertext = await ciphertextOf({ mode: 'ecb' });
    expect(ciphertext).toHaveLength(pkcs7Pad(flatImageRgb(), BLOCK).length);
    expect(bytesEqual(block(ciphertext, 0), block(ciphertext, 3))).toBe(true);
    expect(bytesEqual(block(ciphertext, 2), block(ciphertext, 5))).toBe(true);
    expect(countRepeatedBlocks(ciphertext, BLOCK)).toEqual({ repeated: 3, total: 7 });
  });

  it('CBC: the same runs give different ciphertext blocks', async () => {
    const ciphertext = await ciphertextOf({ mode: 'cbc' });
    expect(bytesEqual(block(ciphertext, 0), block(ciphertext, 3))).toBe(false);
    expect(countRepeatedBlocks(ciphertext, BLOCK).repeated).toBe(0);
  });

  it('CBC depends on the IV, ECB ignores it', async () => {
    const otherIv = new Uint8Array(16).fill(0x02);
    expect(bytesEqual(await ciphertextOf({ mode: 'cbc' }), await ciphertextOf({ mode: 'cbc', iv: otherIv }))).toBe(false);
    expect(bytesEqual(await ciphertextOf({ mode: 'ecb' }), await ciphertextOf({ mode: 'ecb', iv: otherIv }))).toBe(true);
  });

  it('pads a non-aligned RGB stream with PKCS#7 to whole blocks', async () => {
    expect(await ciphertextOf({ rgb: new Uint8Array(3) })).toHaveLength(BLOCK);
    expect(await ciphertextOf({ rgb: new Uint8Array(0) })).toHaveLength(BLOCK);
  });

  it('echoes the job id', async () => {
    expect((await runPenguinJob(request({ id: 42 }), producers())).id).toBe(42);
  });

  it('reports a wrong key length as core.error.keyLength', async () => {
    const response = await runPenguinJob(request({ key: new Uint8Array(5) }), producers());
    expect(response).toMatchObject({ ok: false, error: { key: 'core.error.keyLength' } });
  });

  it('reports a missing cipher as core.error.portMissing', async () => {
    const response = await runPenguinJob(request(), new Registry<PrimitiveManifest>('empty'));
    expect(response).toMatchObject({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'aes' } } });
  });
});
