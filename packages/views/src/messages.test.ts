import { describe, expect, it } from 'vitest';
import { viewManifests } from './index.ts';
import { loadViewMessages } from './messages.ts';

describe('loadViewMessages', () => {
  it('has a title for every registered view in EN and DE', () => {
    for (const view of viewManifests) {
      expect(loadViewMessages('en')[view.titleKey]).toBeTruthy();
      expect(loadViewMessages('de')[view.titleKey]).toBeTruthy();
    }
  });

  it('returns only the requested locale, falling back to English', () => {
    expect(loadViewMessages('de-DE')['view.state.title']).toBe('Zustand');
    expect(loadViewMessages('fr')['view.state.title']).toBe('State');
    expect(Object.keys(loadViewMessages('en')).every((key) => key.startsWith('view.'))).toBe(true);
  });
});
