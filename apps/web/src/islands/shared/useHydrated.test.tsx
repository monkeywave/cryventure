// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useHydrated } from './useHydrated.ts';

function Probe() {
  return <span>{useHydrated() ? 'hydrated' : 'server'}</span>;
}

describe('useHydrated', () => {
  it('is false during server rendering', () => {
    expect(renderToString(<Probe />)).toContain('server');
  });

  it('turns true once mounted on the client', () => {
    const { result } = renderHook(() => useHydrated());
    expect(result.current).toBe(true);
  });
});
