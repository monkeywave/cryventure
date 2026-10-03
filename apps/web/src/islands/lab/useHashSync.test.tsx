// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LabStore } from '@cryventure/viz';
import type { HashEnvironment } from '../../labs/hashWriter.ts';
import { useHashSync } from './useHashSync.ts';

/** A store that never changes (the hook only subscribes and reads the step). */
const store = { subscribe: () => () => undefined, getState: () => ({ step: -1 }) } as unknown as LabStore;

function fakeEnvironment(initial: string) {
  let hash = initial;
  const env: HashEnvironment = {
    readHash: () => hash,
    replaceHash: (next) => {
      hash = next;
    },
    setTimer: () => 0,
    clearTimer: () => undefined,
  };
  return { env: () => env, hash: () => hash };
}

const LINKED = 'intro&lab=ecb&p=e30&v=1&lab=other&s=1&v=1';

describe('useHashSync', () => {
  it('leaves the initial hash untouched', () => {
    const fake = fakeEnvironment(LINKED);
    renderHook(() => useHashSync('ecb', store, {}, { env: fake.env }));
    expect(fake.hash()).toBe(LINKED);
  });

  it("removes this lab's unusable link, keeping other labs and the heading anchor", () => {
    const fake = fakeEnvironment(LINKED);
    renderHook(() => useHashSync('ecb', store, {}, { clearLink: true, env: fake.env }));
    expect(fake.hash()).toBe('intro&lab=other&s=1&v=1');
  });
});
