import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider, useT } from './I18nProvider.tsx';

function Greeting() {
  const t = useT();
  return <p>{t('greet', { name: 'Alice' })}</p>;
}

describe('I18nProvider / useT', () => {
  it('translates with params from the provided messages', () => {
    render(
      <I18nProvider messages={{ greet: 'Hallo {{name}}' }}>
        <Greeting />
      </I18nProvider>,
    );
    expect(screen.getByText('Hallo Alice')).toBeTruthy();
  });

  it('falls back to the key without a provider', () => {
    render(<Greeting />);
    expect(screen.getByText('greet')).toBeTruthy();
  });
});
