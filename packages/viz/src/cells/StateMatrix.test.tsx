import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { vizMessages } from '../i18n/messages.ts';
import { fixtureMessages, fixtureRegions } from '../testing/fixtureBundle.ts';
import { StateMatrix } from './StateMatrix.tsx';

describe('StateMatrix', () => {
  it('renders a region with its translated label, shape and order', () => {
    const region = fixtureRegions[0]!;
    render(
      <I18nProvider messages={{ ...vizMessages.en, ...fixtureMessages }}>
        <StateMatrix region={region} values={Array.from({ length: 16 }, (_, i) => i)} highlights={[{ indices: [4], kind: 'move' }]} />
      </I18nProvider>,
    );
    expect(screen.getByRole('grid', { name: 'State' }).getAttribute('data-order')).toBe('col-major');
    expect(screen.getByRole('gridcell', { name: 'row 1, column 2, value 0x04, moved' })).toBeTruthy();
  });
});
