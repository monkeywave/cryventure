import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installResizeObserverMock } from '../workspace/resizeObserverMock.ts';
import { renderLab } from '../testing/renderLab.tsx';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { vizMessages } from '../i18n/messages.ts';
import { createLabStore, type ParamsRequestHandler } from './createLabStore.ts';
import { useLab, useLabActions, useLabStore } from './LabContext.tsx';
import { LabRoot } from './LabRoot.tsx';
import { useLabLayout } from './LabLayout.tsx';
import { selectStepCount } from './labReducers.ts';

function Probe() {
  const step = useLab((state) => state.step);
  const actions = useLabActions();
  const store = useLabStore();
  return <output data-testid="probe">{`${step}:${typeof actions.next}:${selectStepCount(store.getState())}`}</output>;
}

describe('LabRoot / LabContext', () => {
  it('renders a labelled lab region and provides the store to hooks', () => {
    renderLab(<Probe />);
    expect(screen.getByRole('region', { name: 'Interactive lab' })).toBeTruthy();
    expect(screen.getByTestId('probe').textContent).toBe('-1:function:0');
  });
});

function LayoutProbe() {
  const { narrow } = useLabLayout();
  return <output data-testid="layout">{String(narrow)}</output>;
}

describe('LabRoot layout', () => {
  afterEach(() => vi.restoreAllMocks());

  it('measures the lab container and shares narrow/wide with every descendant', () => {
    const mock = installResizeObserverMock();
    renderLab(<LayoutProbe />);
    const lab = screen.getByRole('region', { name: 'Interactive lab' });
    expect(screen.getByTestId('layout').textContent).toBe('false');
    act(() => mock.resize(lab, 390));
    expect(screen.getByTestId('layout').textContent).toBe('true');
    expect(lab.dataset['narrow']).toBe('true');
    act(() => mock.resize(lab, 1280));
    expect(screen.getByTestId('layout').textContent).toBe('false');
    mock.restore();
  });

  it('is wide outside a lab', () => {
    render(<LayoutProbe />);
    expect(screen.getByTestId('layout').textContent).toBe('false');
  });
});

function RequestButton() {
  const { requestParams } = useLabActions();
  return (
    <button type="button" onClick={() => requestParams({ detail: 'round' })}>
      request
    </button>
  );
}

function renderWithHandler(store: ReturnType<typeof createLabStore>, handler: ParamsRequestHandler | undefined) {
  return (
    <I18nProvider messages={vizMessages.en}>
      <LabRoot store={store} onRequestParams={handler}>
        <RequestButton />
      </LabRoot>
    </I18nProvider>
  );
}

describe('LabRoot onRequestParams', () => {
  it("routes a view's requestParams to the latest host handler and unwires on unmount", () => {
    const store = createLabStore(null);
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = render(renderWithHandler(store, first));
    act(() => screen.getByRole('button', { name: 'request' }).click());
    expect(first).toHaveBeenCalledWith({ detail: 'round' });
    rerender(renderWithHandler(store, second));
    act(() => screen.getByRole('button', { name: 'request' }).click());
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    unmount();
    store.getState().requestParams({ detail: 'op' });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for views when the host wires nothing', () => {
    renderLab(<RequestButton />);
    expect(() => act(() => screen.getByRole('button', { name: 'request' }).click())).not.toThrow();
  });
});

function ZoomLink() {
  const href = useLabActions().labHref?.('aes', { keyHex: '00' });
  return href === undefined ? <span data-testid="zoom">none</span> : <a href={href}>zoom</a>;
}

describe('useLabActions().labHref', () => {
  it('gives views the host link on their first render', () => {
    renderLab(<ZoomLink />, { labHref: (producerId) => `/en/lab/${producerId}/#lab=${producerId}` });
    expect(screen.getByRole('link', { name: 'zoom' }).getAttribute('href')).toBe('/en/lab/aes/#lab=aes');
  });

  it('is absent without host wiring, so views render no link', () => {
    renderLab(<ZoomLink />);
    expect(screen.getByTestId('zoom').textContent).toBe('none');
  });
});
