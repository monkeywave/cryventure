/**
 * Prompt-to-reload toast (docs/M3.md §11). The localized markup is server-rendered into a
 * `<template>` by `PwaRegistration.astro`; this module only clones it and wires the two buttons.
 */

export const TOAST_SELECTOR = '.cv-pwa-toast';

/** Shows the toast once; `onReload` runs on "Reload", "Later" just removes it. */
export function showUpdateToast(template: HTMLTemplateElement, onReload: () => void): void {
  if (document.querySelector(TOAST_SELECTOR)) return;
  const toast = template.content.firstElementChild?.cloneNode(true);
  if (!(toast instanceof HTMLElement)) return;
  toast.addEventListener('click', (event) => {
    const action = event.target instanceof Element ? event.target.closest('button')?.dataset.action : undefined;
    if (action === 'reload') {
      toast.querySelectorAll('button').forEach((button) => (button.disabled = true));
      onReload();
    } else if (action === 'later') {
      toast.remove();
    }
  });
  document.body.append(toast);
}
