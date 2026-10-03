// @vitest-environment jsdom
import '@cryventure/viz/testing/setup';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PrimitiveManifest } from '@cryventure/core';
import { I18nProvider } from '@cryventure/viz';
import { labMessages } from '../../labs/labMessages.ts';
import type { LabParams } from '../../labs/labSession.ts';
import { producerRegistry } from '../../labs/registry.ts';
import { ParamPanel } from './ParamPanel.tsx';

const aes = producerRegistry.require('aes') as PrimitiveManifest<LabParams>;

function renderPanel(lang = 'en', onApply = vi.fn()) {
  render(
    <I18nProvider messages={labMessages(lang, aes)}>
      <ParamPanel producer={aes} params={aes.defaults as LabParams} onApply={onApply} />
    </I18nProvider>,
  );
  return onApply;
}

describe('ParamPanel', () => {
  it('renders the fields the manifest declares, with plugin-owned labels and hints', () => {
    renderPanel();
    expect(screen.getByLabelText('Key (hex)')).toHaveProperty('name', 'keyHex');
    expect(screen.getByLabelText('Plaintext (hex)')).toHaveProperty('name', 'plaintextHex');
    expect(screen.getByLabelText('Level of detail')).toHaveProperty('value', 'op');
    expect(screen.getByLabelText('Key (hex)').getAttribute('aria-describedby')).toMatch(/-hint .*-error$/);
  });

  it('is localized', () => {
    renderPanel('de');
    expect(screen.getByRole('group', { name: 'Eingaben' })).toBeTruthy();
    expect(screen.getByLabelText('Schlüssel (hex)')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Ganze Runden' })).toBeTruthy();
  });

  it('applies a valid select change', () => {
    const onApply = renderPanel();
    fireEvent.change(screen.getByLabelText('Level of detail'), { target: { value: 'round' } });
    expect(onApply).toHaveBeenCalledWith({ ...aes.defaults, detail: 'round' });
  });

  it('shows a localized error and does not apply invalid hex', () => {
    const onApply = renderPanel();
    const key = screen.getByLabelText('Key (hex)');
    fireEvent.change(key, { target: { value: 'zz' } });
    expect(onApply).not.toHaveBeenCalled();
    expect(key.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(/is not a hex digit/)).toBeTruthy();
  });

  it('shows params changed from outside (a view request) in the text fields', () => {
    const onApply = vi.fn();
    const panel = (params: LabParams) => (
      <I18nProvider messages={labMessages('en', aes)}>
        <ParamPanel producer={aes} params={params} onApply={onApply} />
      </I18nProvider>
    );
    const { rerender } = render(panel(aes.defaults as LabParams));
    const keyHex = 'ff'.repeat(16);
    rerender(panel({ ...(aes.defaults as LabParams), keyHex }));
    expect(screen.getByLabelText('Key (hex)')).toHaveProperty('value', keyHex);
  });

  it("keeps the learner's draft text when its own edit comes back as new params", () => {
    const onApply = vi.fn();
    const panel = (params: LabParams) => (
      <I18nProvider messages={labMessages('en', aes)}>
        <ParamPanel producer={aes} params={params} onApply={onApply} />
      </I18nProvider>
    );
    const { rerender } = render(panel(aes.defaults as LabParams));
    const draft = 'FF'.repeat(16);
    fireEvent.change(screen.getByLabelText('Key (hex)'), { target: { value: draft } });
    rerender(panel(onApply.mock.calls[0]?.[0] as LabParams));
    expect(screen.getByLabelText('Key (hex)')).toHaveProperty('value', draft);
  });

  it('shows an external change after an own edit, even back to the value the field applied earlier', () => {
    const onApply = vi.fn();
    const panel = (params: LabParams) => (
      <I18nProvider messages={labMessages('en', aes)}>
        <ParamPanel producer={aes} params={params} onApply={onApply} />
      </I18nProvider>
    );
    const defaults = aes.defaults as LabParams;
    const { rerender } = render(panel(defaults));
    const key = () => screen.getByLabelText('Key (hex)');
    fireEvent.change(key(), { target: { value: 'AA'.repeat(16) } });
    const own = onApply.mock.calls[0]?.[0] as LabParams;
    rerender(panel(own));
    rerender(panel({ ...defaults, keyHex: '00'.repeat(16) }));
    expect(key()).toHaveProperty('value', '00'.repeat(16));
    rerender(panel(own));
    expect(key()).toHaveProperty('value', own.keyHex);
  });

  it('replaces an invalid draft and its error when the params change from outside', () => {
    const panel = (params: LabParams) => (
      <I18nProvider messages={labMessages('en', aes)}>
        <ParamPanel producer={aes} params={params} onApply={vi.fn()} />
      </I18nProvider>
    );
    const { rerender } = render(panel(aes.defaults as LabParams));
    const key = () => screen.getByLabelText('Key (hex)');
    fireEvent.change(key(), { target: { value: 'zz' } });
    expect(key().getAttribute('aria-invalid')).toBe('true');
    rerender(panel({ ...(aes.defaults as LabParams), keyHex: 'ff'.repeat(16) }));
    expect(key()).toHaveProperty('value', 'ff'.repeat(16));
    expect(key().getAttribute('aria-invalid')).toBe('false');
  });

  it("shows a rejected view request's error, localized", () => {
    render(
      <I18nProvider messages={labMessages('en', aes)}>
        <ParamPanel producer={aes} params={aes.defaults as LabParams} onApply={vi.fn()} requestError={{ key: 'core.error.hexInvalidChar', params: { char: 'z', index: 0 } }} />
      </I18nProvider>,
    );
    expect(screen.getByText(/is not a hex digit/)).toBeTruthy();
  });
});
