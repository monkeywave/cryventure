// @vitest-environment jsdom
import '@cryventure/viz/testing/setup';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFixtureBundle, renderLab } from '@cryventure/viz/testing';
import { labMessages } from '../../labs/labMessages.ts';
import { producerRegistry } from '../../labs/registry.ts';
import { OutputPanel } from './OutputPanel.tsx';

const aesManifest = producerRegistry.require('aes');
const CIPHERTEXT = [0x69, 0xc4, 0xe0, 0xd8, 0x6a, 0x7b, 0x04, 0x30];

function renderPanel(lang: string, output: Record<string, number[]>, producer = aesManifest) {
  const bundle = { ...createFixtureBundle(), output };
  return renderLab(<OutputPanel producer={producer} />, { bundle, messages: labMessages(lang, aesManifest) });
}

describe('OutputPanel', () => {
  it('labels an output with its declared label key and shows grouped hex', () => {
    renderPanel('en', { ciphertext: CIPHERTEXT });
    expect(screen.getByText('Ciphertext')).toBeTruthy();
    expect(screen.getByTestId('lab-output-ciphertext').textContent).toBe('69c4e0d8 6a7b0430');
  });

  it('renders the German label', () => {
    renderPanel('de', { ciphertext: CIPHERTEXT });
    expect(screen.getByText('Geheimtext')).toBeTruthy();
  });

  it('falls back to the raw name for an undeclared output', () => {
    renderPanel('en', { tag: [0x01] }, { ...aesManifest, outputs: {} });
    expect(screen.getByText('tag')).toBeTruthy();
  });

  it('renders an empty list without a bundle output', () => {
    renderLab(<OutputPanel producer={aesManifest} />, { bundle: null, messages: labMessages('en', aesManifest) });
    expect(document.querySelectorAll('.cv-output__item')).toHaveLength(0);
  });
});
