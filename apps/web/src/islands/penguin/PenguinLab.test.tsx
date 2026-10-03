// @vitest-environment jsdom
import '@cryventure/viz/testing/setup';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCoreMessages } from '@cryventure/core/messages';
import en from '../../i18n/en/penguin.json' with { type: 'json' };
import de from '../../i18n/de/penguin.json' with { type: 'json' };
import { FakeWorker } from './fakeWorker.testing.ts';
import PenguinLab from './PenguinLab.tsx';
import { PENGUIN_SIZE } from './penguinArt.ts';

const coreEn = loadCoreMessages('en');
const messages = { ...en, ...coreEn };

/** jsdom has no 2D canvas, image decoding or ImageData: minimal stand-ins. */
function stubCanvas() {
  const context = {
    imageSmoothingEnabled: true,
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    putImageData: vi.fn(),
    getImageData: (_x: number, _y: number, width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.stubGlobal('ImageData', class {
    constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {}
  });
  HTMLImageElement.prototype.decode = () => Promise.resolve();
  return context;
}

const encryptButton = () => screen.getByRole('button', { name: 'Encrypt' });
const status = () => screen.getByRole('status');

async function renderLab() {
  render(<PenguinLab messages={messages} locale="en" createWorker={FakeWorker.factory} />);
  await waitFor(() => expect(screen.getByRole('img', { name: /cartoon penguin/ })).toBeTruthy());
}

beforeEach(() => {
  FakeWorker.created = [];
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PenguinLab', () => {
  it('renders every visible string from the EN and DE catalogs (no raw keys)', () => {
    for (const catalog of [en, de]) {
      const html = renderToString(<PenguinLab messages={{ ...catalog, ...coreEn }} locale="en" />);
      expect(html).not.toMatch(/ui\.penguin\./);
    }
  });

  it('labels the controls; the IV is only editable in CBC', async () => {
    stubCanvas();
    await renderLab();
    const iv = screen.getByLabelText('IV (16 bytes as hex)');
    expect(screen.getByRole('radio', { name: 'ECB' })).toHaveProperty('checked', true);
    expect(iv).toHaveProperty('disabled', true);
    await userEvent.click(screen.getByRole('radio', { name: 'CBC' }));
    expect(iv).toHaveProperty('disabled', false);
    expect(screen.getByLabelText('Use your own picture')).toHaveProperty('accept', 'image/*');
  });

  it('encrypts the rasterised penguin in the worker and reports repeated blocks', async () => {
    stubCanvas();
    await renderLab();
    await userEvent.click(encryptButton());
    const worker = FakeWorker.last();
    expect(worker.requests[0]).toMatchObject({ mode: 'ecb' });
    expect(worker.requests[0]!.rgb).toHaveLength(PENGUIN_SIZE * PENGUIN_SIZE * 3);
    expect(status().textContent).toContain('Encrypting with AES-ECB');
    const ciphertext = new Uint8Array(32); // two equal blocks
    act(() => worker.respond({ id: worker.requests[0]!.id, ok: true, ciphertext }));
    expect(status().textContent).toContain('AES-ECB: 1 of 2 ciphertext blocks repeats an earlier block.');
    expect(screen.getByRole('img', { name: /under AES-ECB, drawn as pixels: 1 of 2 16-byte ciphertext blocks repeats an earlier block/ })).toBeTruthy();
    expect(screen.getByText('Encrypted (AES-ECB)')).toBeTruthy();
  });

  it('picks the plural form from the number of repeated blocks (EN and DE)', async () => {
    stubCanvas();
    await renderLab();
    await userEvent.click(encryptButton());
    const worker = FakeWorker.last();
    act(() => worker.respond({ id: worker.requests[0]!.id, ok: true, ciphertext: new Uint8Array(48) })); // three equal blocks
    expect(status().textContent).toContain('AES-ECB: 2 of 3 ciphertext blocks repeat an earlier block.');
    cleanup();

    render(<PenguinLab messages={{ ...de, ...coreEn }} locale="de" createWorker={FakeWorker.factory} />);
    await waitFor(() => expect(screen.getByRole('img', { name: /Comic-Pinguin/ })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Verschlüsseln' }));
    const deWorker = FakeWorker.last();
    act(() => deWorker.respond({ id: deWorker.requests[0]!.id, ok: true, ciphertext: new Uint8Array(32) }));
    expect(status().textContent).toContain('AES-ECB: 1 von 2 Geheimtextblöcken wiederholt einen früheren Block.');
  });

  it('refuses a picture over the size cap with a message instead of decoding it', async () => {
    stubCanvas();
    const createImageBitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    await renderLab();
    const file = new File(['x'], 'huge.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 });
    await userEvent.upload(screen.getByLabelText('Use your own picture'), file);
    expect(screen.getByRole('alert').textContent).toBe(en['ui.penguin.upload.tooLarge'].replace('{{max}}', '20'));
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: /cartoon penguin/ })).toBeTruthy();
  });

  it('blocks an invalid key, explains it and moves focus to the field', async () => {
    stubCanvas();
    await renderLab();
    const key = screen.getByLabelText('Key (16 bytes as hex)');
    await userEvent.clear(key);
    await userEvent.type(key, '00ff');
    expect(screen.getByText(/The key must be exactly 16 bytes .* this one has 2\./)).toBeTruthy();
    expect(key.getAttribute('aria-invalid')).toBe('true');
    await userEvent.click(encryptButton());
    expect(FakeWorker.created).toHaveLength(0);
    expect(document.activeElement).toBe(key);
  });
});
