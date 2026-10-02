import { describe, expect, it } from 'vitest';
import { loadVizMessages, vizMessages } from './messages.ts';

describe('loadVizMessages', () => {
  it('returns the catalog of the resolved locale only', () => {
    expect(loadVizMessages('de-AT')).toBe(vizMessages.de);
    expect(loadVizMessages('fr')).toBe(vizMessages.en);
  });
});
