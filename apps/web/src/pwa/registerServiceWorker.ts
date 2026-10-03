/**
 * Service-worker registration with prompt-to-reload (docs/M3.md §11), kept apart from
 * `PwaRegistration.astro` so it can be tested with fakes.
 */
import type { UpdateToastOptions } from './updateToast';

/** The part of `navigator.serviceWorker` used here. */
export type ServiceWorkerHost = Pick<ServiceWorkerContainer, 'controller' | 'addEventListener'>;

/** The part of workbox-window's `Workbox` used here. */
export interface UpdateWorkbox {
  addEventListener: (type: 'waiting', listener: () => void) => void;
  messageSkipWaiting: () => void;
  register: () => Promise<ServiceWorkerRegistration | undefined>;
}

export interface ServiceWorkerRegistrationDeps {
  container: ServiceWorkerHost;
  workbox: UpdateWorkbox;
  showToast: (onReload: () => void, options?: UpdateToastOptions) => void;
  reload: () => void;
}

/**
 * Whether service workers can be used. `'serviceWorker' in navigator` alone is not enough: some
 * browsers (privacy modes, embedded views) expose the property as `undefined`.
 */
export function supportsServiceWorker(nav: { serviceWorker?: ServiceWorkerContainer | undefined }): boolean {
  return nav.serviceWorker != null;
}

/** The part of `window` that `whenPageIdle` uses. */
export interface IdleHost {
  document: Pick<Document, 'readyState'>;
  addEventListener: (type: 'load', listener: () => void, options: { once: true }) => void;
  requestIdleCallback?: (callback: () => void) => unknown;
  setTimeout: (callback: () => void) => unknown;
}

/**
 * Runs `callback` once the page has loaded and the browser is idle (a plain timeout where
 * `requestIdleCallback` is missing), so the registration never competes with the first paint.
 */
export function whenPageIdle(callback: () => void, host: IdleHost = window): void {
  const onIdle = () => (host.requestIdleCallback ? host.requestIdleCallback(callback) : host.setTimeout(callback));
  if (host.document.readyState === 'complete') onIdle();
  else host.addEventListener('load', onIdle, { once: true });
}

/**
 * Registers the worker. A waiting update is activated only after "Reload" in the toast, and this tab
 * reloads once the new worker controls it. When the new worker takes control because "Reload" was
 * clicked in another tab, this tab's HTML is stale (its lazy chunks may be gone), so the toast is
 * shown again with a direct reload. The first install claiming an uncontrolled page is not an update.
 * Resolves `false` instead of throwing when registration fails or yields no registration.
 */
export async function registerServiceWorker({ container, workbox, showToast, reload }: ServiceWorkerRegistrationDeps): Promise<boolean> {
  let reloadRequested = false;
  let controller = container.controller;

  container.addEventListener('controllerchange', () => {
    const previous = controller;
    controller = container.controller;
    if (reloadRequested) reload();
    else if (previous !== null) showToast(reload, { replace: true });
  });

  workbox.addEventListener('waiting', () =>
    showToast(() => {
      reloadRequested = true;
      workbox.messageSkipWaiting();
    }),
  );

  try {
    return (await workbox.register()) !== undefined;
  } catch {
    return false;
  }
}
