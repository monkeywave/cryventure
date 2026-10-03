// @vitest-environment jsdom
import '@cryventure/viz/testing/setup';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrimitiveManifest } from '@cryventure/core';
import { I18nProvider } from '@cryventure/viz';
import { labMessages } from '../../labs/labMessages.ts';
import type { LabParams } from '../../labs/labSession.ts';
import { producerRegistry } from '../../labs/registry.ts';
import { ParamPanel, TEXT_EDIT_DEBOUNCE_MS } from './ParamPanel.tsx';

const aes = producerRegistry.require('aes') as PrimitiveManifest<LabParams>;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Types `value` into a text or hex field and waits out the debounce, so the edit is validated and applied. */
function typeInto(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  act(() => vi.advanceTimersByTime(TEXT_EDIT_DEBOUNCE_MS));
}

/** A panel whose params follow its own edits, like `useLabSession().pendingParams` does in the lab. */
function PendingParamsPanel({ onApply }: { onApply: (params: LabParams) => void }) {
  const [params, setParams] = useState(aes.defaults as LabParams);
  const apply = (next: LabParams) => {
    onApply(next);
    setParams(next);
  };
  return (
    <I18nProvider messages={labMessages('en', aes)}>
      <ParamPanel producer={aes} params={params} onApply={apply} />
    </I18nProvider>
  );
}

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

  it('builds a second edit on the first, through the pending params it is given', () => {
    const onApply = vi.fn();
    render(<PendingParamsPanel onApply={onApply} />);
    typeInto(screen.getByLabelText('Key (hex)'), '00'.repeat(16));
    typeInto(screen.getByLabelText('Plaintext (hex)'), '11'.repeat(16));
    expect(onApply).toHaveBeenLastCalledWith({ ...aes.defaults, keyHex: '00'.repeat(16), plaintextHex: '11'.repeat(16) });
  });

  it('applies text edits only once typing pauses, with the last text', () => {
    const onApply = renderPanel();
    const key = screen.getByLabelText('Key (hex)');
    fireEvent.change(key, { target: { value: '0' } });
    act(() => vi.advanceTimersByTime(TEXT_EDIT_DEBOUNCE_MS - 1));
    fireEvent.change(key, { target: { value: '00'.repeat(16) } });
    expect(key).toHaveProperty('value', '00'.repeat(16));
    act(() => vi.advanceTimersByTime(TEXT_EDIT_DEBOUNCE_MS - 1));
    expect(onApply).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({ ...aes.defaults, keyHex: '00'.repeat(16) });
  });

  it('drops a pending text edit when params change from outside', () => {
    const onApply = vi.fn();
    const panel = (params: LabParams) => (
      <I18nProvider messages={labMessages('en', aes)}>
        <ParamPanel producer={aes} params={params} onApply={onApply} />
      </I18nProvider>
    );
    const { rerender } = render(panel(aes.defaults as LabParams));
    fireEvent.change(screen.getByLabelText('Key (hex)'), { target: { value: '00'.repeat(16) } });
    rerender(panel({ ...(aes.defaults as LabParams), keyHex: 'ff'.repeat(16) }));
    act(() => vi.advanceTimersByTime(TEXT_EDIT_DEBOUNCE_MS));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Key (hex)')).toHaveProperty('value', 'ff'.repeat(16));
  });

  it('shows a localized error and does not apply invalid hex', () => {
    const onApply = renderPanel();
    const key = screen.getByLabelText('Key (hex)');
    typeInto(key, 'zz');
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
    typeInto(screen.getByLabelText('Key (hex)'), draft);
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
    typeInto(key(), 'AA'.repeat(16));
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
    typeInto(key(), 'zz');
    expect(key().getAttribute('aria-invalid')).toBe('true');
    rerender(panel({ ...(aes.defaults as LabParams), keyHex: 'ff'.repeat(16) }));
    expect(key()).toHaveProperty('value', 'ff'.repeat(16));
    expect(key().getAttribute('aria-invalid')).toBe('false');
  });

  it('resets an invalid draft and its error when a preset leaves that field unchanged', () => {
    const panel = (params: LabParams) => (
      <I18nProvider messages={labMessages('en', aes)}>
        <ParamPanel producer={aes} params={params} onApply={vi.fn()} />
      </I18nProvider>
    );
    const defaults = aes.defaults as LabParams;
    const { rerender } = render(panel(defaults));
    const key = () => screen.getByLabelText('Key (hex)');
    typeInto(key(), 'zz');
    rerender(panel({ ...defaults, plaintextHex: 'ff'.repeat(16) }));
    expect(key()).toHaveProperty('value', defaults.keyHex);
    expect(key().getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByText(/is not a hex digit/)).toBeNull();
  });

  it("keeps another field's invalid draft while the learner's own edit is applied", () => {
    const onApply = vi.fn();
    const panel = (params: LabParams) => (
      <I18nProvider messages={labMessages('en', aes)}>
        <ParamPanel producer={aes} params={params} onApply={onApply} />
      </I18nProvider>
    );
    const { rerender } = render(panel(aes.defaults as LabParams));
    typeInto(screen.getByLabelText('Key (hex)'), 'zz');
    typeInto(screen.getByLabelText('Plaintext (hex)'), 'AA'.repeat(16));
    rerender(panel(onApply.mock.calls[0]?.[0] as LabParams));
    expect(screen.getByLabelText('Key (hex)')).toHaveProperty('value', 'zz');
    expect(screen.getByLabelText('Key (hex)').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Plaintext (hex)')).toHaveProperty('value', 'AA'.repeat(16));
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

/** A composite with a `cipher` port param and a `text` param, validated like the M3 attack labs. */
const composite = {
  ...aes,
  id: 'toy-mode',
  i18nNamespace: 'plugin.aes',
  presets: [],
  defaults: { cipher: 'aes', note: 'hi' },
  paramFields: [
    { name: 'cipher', kind: 'port', port: 'BlockCipher', labelKey: 'plugin.aes.param.key' },
    { name: 'note', kind: 'text', maxLength: 8, labelKey: 'plugin.aes.param.plaintext' },
  ],
  validate: (input: unknown) => {
    const { cipher, note } = input as LabParams;
    if (typeof note !== 'string' || new TextEncoder().encode(note).length > 8) return { ok: false, error: { key: 'core.error.hexInvalidChar', params: { char: '!', index: 0 } } };
    return { ok: true, value: { cipher, note } };
  },
} as unknown as PrimitiveManifest<LabParams>;

function renderComposite(lang = 'en', onApply = vi.fn(), producers?: PrimitiveManifest[]) {
  const messages = { ...labMessages(lang, aes), ...labMessages(lang, producerRegistry.require('xor')) };
  render(
    <I18nProvider messages={messages}>
      <ParamPanel producer={composite} params={composite.defaults as LabParams} onApply={onApply} producers={producers} />
    </I18nProvider>,
  );
  return onApply;
}

describe('ParamPanel port fields', () => {
  it('offers every registered producer implementing the port, labelled by its title', () => {
    renderComposite();
    const select = screen.getByLabelText('Key (hex)') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.value).toBe('aes');
    const implementers = producerRegistry.list().filter((producer) => producer.implements.includes('BlockCipher'));
    expect([...select.options].map((option) => option.value)).toEqual(implementers.map((producer) => producer.id).sort());
    expect(screen.getByRole('option', { name: 'AES (Advanced Encryption Standard)' })).toBeTruthy();
  });

  it('applies a picked producer', () => {
    const xorAsCipher = { ...producerRegistry.require('xor'), implements: ['BlockCipher'] } as PrimitiveManifest;
    const onApply = renderComposite('en', vi.fn(), [producerRegistry.require('aes'), xorAsCipher]);
    fireEvent.change(screen.getByLabelText('Key (hex)'), { target: { value: 'xor' } });
    expect(onApply).toHaveBeenCalledWith({ cipher: 'xor', note: 'hi' });
  });
});

describe('ParamPanel text fields', () => {
  it('renders a text input with a UTF-8 byte counter against maxLength', () => {
    renderComposite();
    const input = screen.getByLabelText('Plaintext (hex)') as HTMLInputElement;
    expect(input.tagName).toBe('INPUT');
    expect(input.value).toBe('hi');
    expect(screen.getByText('2 / 8 bytes (UTF-8)')).toBeTruthy();
    expect(input.getAttribute('aria-describedby')).toMatch(/-count .*-error$/);
  });

  it('counts bytes, not characters, and applies valid text', () => {
    const onApply = renderComposite();
    typeInto(screen.getByLabelText('Plaintext (hex)'), 'äö');
    expect(screen.getByText('4 / 8 bytes (UTF-8)')).toBeTruthy();
    expect(onApply).toHaveBeenCalledWith({ cipher: 'aes', note: 'äö' });
  });

  it('flags text over the limit, shows the validation error and does not apply it', () => {
    const onApply = renderComposite();
    const input = screen.getByLabelText('Plaintext (hex)');
    typeInto(input, 'ääääää');
    expect(onApply).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('12 / 8 bytes (UTF-8)').getAttribute('data-over')).toBe('true');
    expect(screen.getByText(/is not a hex digit/)).toBeTruthy();
  });

  it('is localized', () => {
    renderComposite('de');
    expect(screen.getByText('2 / 8 Byte (UTF-8)')).toBeTruthy();
  });
});
