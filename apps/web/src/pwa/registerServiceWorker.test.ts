// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { registerServiceWorker, supportsServiceWorker, type ServiceWorkerHost, type UpdateWorkbox } from './registerServiceWorker';

type Listener = () => void;

/** A service-worker container whose controller can be swapped like a real activation does. */
function fakeContainer(controller: object | null) {
  const target = new EventTarget();
  const container = {
    controller,
    addEventListener: (type: string, listener: Listener) => target.addEventListener(type, listener),
  };
  const takeControl = (worker: object) => {
    container.controller = worker;
    target.dispatchEvent(new Event('controllerchange'));
  };
  return { container: container as unknown as ServiceWorkerHost, takeControl };
}

function fakeWorkbox(register: () => Promise<unknown> = async () => ({})) {
  const listeners: Listener[] = [];
  const workbox: UpdateWorkbox & { fireWaiting: () => void } = {
    addEventListener: (_type, listener) => listeners.push(listener),
    messageSkipWaiting: vi.fn(),
    register: register as UpdateWorkbox['register'],
    fireWaiting: () => listeners.forEach((listener) => listener()),
  };
  return workbox;
}

function setup(controller: object | null = {}, register?: () => Promise<unknown>) {
  const { container, takeControl } = fakeContainer(controller);
  const workbox = fakeWorkbox(register);
  const showToast = vi.fn<(onReload: () => void, options?: { replace?: boolean }) => void>();
  const reload = vi.fn();
  const registered = registerServiceWorker({ container, workbox, showToast, reload });
  return { workbox, takeControl, showToast, reload, registered };
}

describe('supportsServiceWorker', () => {
  it('needs a defined navigator.serviceWorker', () => {
    expect(supportsServiceWorker({})).toBe(false);
    expect(supportsServiceWorker({ serviceWorker: undefined })).toBe(false);
    expect(supportsServiceWorker({ serviceWorker: {} as ServiceWorkerContainer })).toBe(true);
  });
});

describe('registerServiceWorker', () => {
  it('asks before activating a waiting update, then reloads once it controls this tab', () => {
    const { workbox, takeControl, showToast, reload } = setup();
    workbox.fireWaiting();
    expect(showToast).toHaveBeenCalledTimes(1);
    showToast.mock.calls[0]?.[0]();
    expect(workbox.messageSkipWaiting).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    takeControl({});
    expect(reload).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('offers a direct reload when an update was activated from another tab', () => {
    const { workbox, takeControl, showToast, reload } = setup();
    workbox.fireWaiting();
    takeControl({});
    expect(reload).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledTimes(2);
    const [onReload, options] = showToast.mock.calls[1] ?? [];
    // Replaces the "waiting" toast, whose skip-waiting message would no longer reach a waiting worker.
    expect(options).toEqual({ replace: true });
    onReload?.();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(workbox.messageSkipWaiting).not.toHaveBeenCalled();
  });

  it('stays quiet when the first install claims an uncontrolled page', () => {
    const { takeControl, showToast, reload } = setup(null);
    takeControl({});
    expect(showToast).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('resolves false instead of throwing when registration fails or yields no registration', async () => {
    await expect(setup({}, async () => undefined).registered).resolves.toBe(false);
    await expect(setup({}, () => Promise.reject(new TypeError("Cannot read properties of undefined (reading 'waiting')"))).registered).resolves.toBe(false);
    await expect(setup({}).registered).resolves.toBe(true);
  });
});
