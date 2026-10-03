// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeUpload, MAX_UPLOAD_BYTES, MAX_UPLOAD_SIDE, uploadSizeError } from './canvas.ts';

function fileOfSize(size: number): File {
  const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

const fakeBitmap = { width: 1, height: 1, close: () => {} } as unknown as ImageBitmap;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadSizeError', () => {
  it('accepts files up to the cap', () => {
    expect(uploadSizeError(fileOfSize(MAX_UPLOAD_BYTES))).toBeUndefined();
  });

  it('rejects larger files with a translated message naming the cap in MB', () => {
    expect(uploadSizeError(fileOfSize(MAX_UPLOAD_BYTES + 1))).toEqual({ key: 'ui.penguin.upload.tooLarge', params: { max: 20 } });
  });
});

describe('decodeUpload', () => {
  it('asks the decoder for the downscaled size, so the full-size image is never kept in memory', async () => {
    const createImageBitmap = vi.fn().mockResolvedValue(fakeBitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const file = fileOfSize(1000);
    await decodeUpload(file, () => Promise.resolve({ width: 8000, height: 6000 }));
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    expect(createImageBitmap).toHaveBeenCalledWith(file, { resizeWidth: MAX_UPLOAD_SIDE, resizeHeight: 192, resizeQuality: 'high' });
  });

  it('never upscales a small picture', async () => {
    const createImageBitmap = vi.fn().mockResolvedValue(fakeBitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    await decodeUpload(fileOfSize(1000), () => Promise.resolve({ width: 100, height: 50 }));
    expect(createImageBitmap.mock.calls[0]![1]).toMatchObject({ resizeWidth: 100, resizeHeight: 50 });
  });

  it('falls back to a plain decode when the browser does not support the resize options', async () => {
    const createImageBitmap = vi.fn().mockRejectedValueOnce(new TypeError('unsupported')).mockResolvedValueOnce(fakeBitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const file = fileOfSize(1000);
    await expect(decodeUpload(file, () => Promise.resolve({ width: 800, height: 600 }))).resolves.toBe(fakeBitmap);
    expect(createImageBitmap).toHaveBeenLastCalledWith(file);
  });

  it('falls back to a plain decode when the size cannot be probed', async () => {
    const createImageBitmap = vi.fn().mockResolvedValue(fakeBitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const file = fileOfSize(1000);
    await decodeUpload(file, () => Promise.reject(new Error('no size')));
    expect(createImageBitmap).toHaveBeenCalledWith(file);
  });

  it('refuses files over the size cap without decoding them', async () => {
    const createImageBitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    await expect(decodeUpload(fileOfSize(MAX_UPLOAD_BYTES + 1))).rejects.toThrow();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
});
