// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { showUpdateToast, TOAST_SELECTOR } from './updateToast';

function makeTemplate(): HTMLTemplateElement {
  const template = document.createElement('template');
  template.innerHTML =
    '<div class="cv-pwa-toast" role="status"><p>New</p><button type="button" data-action="reload">R</button><button type="button" data-action="later">L</button></div>';
  return template;
}

const button = (action: string) => document.querySelector<HTMLButtonElement>(`${TOAST_SELECTOR} [data-action="${action}"]`)!;

afterEach(() => document.body.replaceChildren());

describe('showUpdateToast', () => {
  it('shows one status toast, even when called twice', () => {
    const template = makeTemplate();
    showUpdateToast(template, vi.fn());
    showUpdateToast(template, vi.fn());
    const toasts = document.querySelectorAll(TOAST_SELECTOR);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.getAttribute('role')).toBe('status');
  });

  it('runs onReload once and disables the buttons on "Reload"', () => {
    const onReload = vi.fn();
    showUpdateToast(makeTemplate(), onReload);
    button('reload').click();
    button('reload').click();
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(button('later').disabled).toBe(true);
  });

  it('removes the toast on "Later" without reloading', () => {
    const onReload = vi.fn();
    showUpdateToast(makeTemplate(), onReload);
    button('later').click();
    expect(document.querySelector(TOAST_SELECTOR)).toBeNull();
    expect(onReload).not.toHaveBeenCalled();
  });
});
