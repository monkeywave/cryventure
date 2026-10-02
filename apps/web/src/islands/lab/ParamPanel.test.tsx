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
    <I18nProvider messages={labMessages(lang, 'aes')}>
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
});
