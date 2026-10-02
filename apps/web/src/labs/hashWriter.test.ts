import { describe, expect, it, vi } from 'vitest';
import { browserHashEnvironment, createLabHashWriter, type HashEnvironment } from './hashWriter.ts';

function fakeEnvironment(initial = '') {
  let hash = initial;
  const timers = new Map<number, () => void>();
  let nextHandle = 1;
  const env: HashEnvironment = {
    readHash: () => hash,
    replaceHash: vi.fn((next: string) => {
      hash = next;
    }),
    setTimer: (callback) => {
      timers.set(nextHandle, callback);
      return nextHandle++;
    },
    clearTimer: (handle) => timers.delete(handle as number),
  };
  const runTimers = () => [...timers.values()].forEach((callback) => callback());
  return { env, runTimers, hash: () => hash, pendingTimers: () => timers.size };
}

describe('createLabHashWriter', () => {
  it('debounces: only the last scheduled state is written', () => {
    const fake = fakeEnvironment();
    const writer = createLabHashWriter('a', fake.env);
    writer.schedule({ step: 1 });
    writer.schedule({ step: 2 });
    expect(fake.pendingTimers()).toBe(1);
    fake.runTimers();
    expect(fake.hash()).toBe('lab=a&s=2&v=1');
    expect(fake.env.replaceHash).toHaveBeenCalledTimes(1);
  });

  it('merges with other labs present at write time', () => {
    const fake = fakeEnvironment('lab=b&s=5&v=1');
    const writer = createLabHashWriter('a', fake.env);
    writer.schedule({ step: 0 });
    writer.flush();
    expect(fake.hash()).toBe('lab=b&s=5&v=1&lab=a&s=0&v=1');
  });

  it('skips writing an unchanged hash', () => {
    const fake = fakeEnvironment('lab=a&s=2&v=1');
    const writer = createLabHashWriter('a', fake.env);
    writer.schedule({ step: 2 });
    writer.flush();
    expect(fake.env.replaceHash).not.toHaveBeenCalled();
  });

  it('clear removes the lab and cancels pending writes', () => {
    const fake = fakeEnvironment('lab=a&s=2&v=1');
    const writer = createLabHashWriter('a', fake.env);
    writer.schedule({ step: 7 });
    writer.clear();
    fake.runTimers();
    expect(fake.hash()).toBe('');
  });

  it('dispose flushes pending state', () => {
    const fake = fakeEnvironment();
    const writer = createLabHashWriter('a', fake.env);
    writer.schedule({ step: 3 });
    writer.dispose();
    expect(fake.hash()).toBe('lab=a&s=3&v=1');
  });
});

describe('browserHashEnvironment', () => {
  function fakeWindow(hash: string) {
    const replaceState = vi.fn();
    const win = {
      location: { hash, pathname: '/en/x/', search: '?q=1' },
      history: { state: { k: 1 }, replaceState },
      setTimeout: vi.fn(() => 42),
      clearTimeout: vi.fn(),
    } as unknown as Window;
    return { win, replaceState };
  }

  it('reads the hash without # and replaces it in place', () => {
    const { win, replaceState } = fakeWindow('#lab=a&v=1');
    const env = browserHashEnvironment(win);
    expect(env.readHash()).toBe('lab=a&v=1');
    env.replaceHash('lab=a&s=1&v=1');
    expect(replaceState).toHaveBeenCalledWith({ k: 1 }, '', '/en/x/?q=1#lab=a&s=1&v=1');
    env.replaceHash('');
    expect(replaceState).toHaveBeenLastCalledWith({ k: 1 }, '', '/en/x/?q=1');
  });

  it('delegates timers to the window', () => {
    const { win } = fakeWindow('');
    const env = browserHashEnvironment(win);
    expect(env.setTimer(() => {}, 10)).toBe(42);
    env.clearTimer(42);
    expect(win.clearTimeout).toHaveBeenCalledWith(42);
  });
});
