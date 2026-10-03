// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDocumentLens, subscribeDocumentLens } from './documentLens.ts';

afterEach(() => {
  delete document.documentElement.dataset.lens;
});

describe('readDocumentLens', () => {
  it('reads a valid lens from <html data-lens>', () => {
    document.documentElement.dataset.lens = 'story';
    expect(readDocumentLens()).toBe('story');
  });

  it('falls back to the default lens when missing or unknown', () => {
    expect(readDocumentLens()).toBe('engineer');
    document.documentElement.dataset.lens = 'wizard';
    expect(readDocumentLens()).toBe('engineer');
  });
});

describe('subscribeDocumentLens', () => {
  it('notifies on data-lens changes only, until unsubscribed', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDocumentLens(listener);
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.dataset.lens = 'story';
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    document.documentElement.dataset.lens = 'cryptographer';
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
    delete document.documentElement.dataset.theme;
  });
});
