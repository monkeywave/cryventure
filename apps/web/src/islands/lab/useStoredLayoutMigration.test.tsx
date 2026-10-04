// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStoredLayoutMigration } from './useStoredLayoutMigration.ts';

const KEY = 'cv.layout.v1.aes-key-schedule';
const ALIASED = JSON.stringify({ version: 1, panelIds: ['state', 'key-schedule'], sizes: { state: 60, 'key-schedule': 40 } });

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

/** Stands in for the workspace: reads the saved layout during its first render, like `Workspace` does. */
function SavedPanels({ seen }: { seen: (raw: string | null) => void }) {
  seen(localStorage.getItem(KEY));
  return null;
}

function Host({ labId, seen }: { labId: string; seen: (raw: string | null) => void }) {
  useStoredLayoutMigration(labId);
  return <SavedPanels seen={seen} />;
}

describe('useStoredLayoutMigration', () => {
  it('migrates the saved panel ids before the workspace below first reads them', () => {
    localStorage.setItem(KEY, ALIASED);
    const seen = vi.fn();
    render(<Host labId="aes-key-schedule" seen={seen} />);
    expect(JSON.parse(seen.mock.calls[0]![0] as string).panelIds).toEqual(['state', 'derivation']);
  });

  it('migrates once per lab, not on every render', () => {
    localStorage.setItem(KEY, ALIASED);
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const { rerender } = render(<Host labId="aes-key-schedule" seen={() => undefined} />);
    const reads = getItem.mock.calls.filter(([key]) => key === KEY).length;
    rerender(<Host labId="aes-key-schedule" seen={() => undefined} />);
    rerender(<Host labId="aes-key-schedule" seen={() => undefined} />);
    // Only the stand-in workspace reads again (once per render); the migration does not.
    expect(getItem.mock.calls.filter(([key]) => key === KEY).length).toBe(reads + 2);
  });
});
