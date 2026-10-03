// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadText, REVOKE_DELAY_MS } from './downloadText.ts';

const createObjectURL = vi.fn((_blob: Blob) => 'blob:download');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
});

describe('downloadText', () => {
  it('clicks a temporary download link for a blob of the text, then removes the link', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('notes.txt');
      expect(this.href).toBe('blob:download');
      expect(this.isConnected).toBe(true);
    });
    downloadText('notes.txt', 'hello', 'text/plain');
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a')).toBeNull();
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob?.type).toBe('text/plain');
    expect(await blob?.text()).toBe('hello');
  });

  it('defaults to JSON', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    downloadText('progress.json', '{}');
    expect(createObjectURL.mock.calls[0]?.[0].type).toBe('application/json');
  });

  it('keeps the object URL alive long enough for the browser to start the download', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    downloadText('progress.json', '{}');
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(REVOKE_DELAY_MS).toBeGreaterThanOrEqual(30_000);
    vi.advanceTimersByTime(REVOKE_DELAY_MS);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
  });
});
