// @vitest-environment jsdom
import '@cryventure/viz/testing/setup';
import { primitiveManifests } from '@cryventure/primitives';
import { viewManifests } from '@cryventure/views';
import type { ViewComponent } from '@cryventure/viz';
import { createFixtureBundle } from '@cryventure/viz/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { primitiveFixtureBundles, type NamedBundle } from './facetFixtures.ts';
import { LENSES, RAW_KEY_PATTERN, labMessages, lensesToRender, rawKeysIn, renderViewProblems, viewRenderCases } from './viewRender.ts';

const element = (html: string) => {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
};

const stateView = async () => (await viewManifests.find((manifest) => manifest.id === 'state')!.load()).default as ViewComponent;

describe('rawKeysIn', () => {
  it('finds untranslated keys in text and accessible-text attributes, once each', () => {
    const root = element('<p>view.state.title</p><button aria-label="ui.player.next">x</button><span title="plugin.aes.op.sub">view.state.title</span>');
    expect(rawKeysIn(root)).toEqual(['view.state.title', 'ui.player.next', 'plugin.aes.op.sub']);
  });

  it('ignores prose, numbers and class names', () => {
    expect(rawKeysIn(element('<p class="cv-view.state">Round 1 · op 2. The view. 1.5 ui.x</p>'))).toEqual([]);
    expect('see plugin.aes.title.'.match(RAW_KEY_PATTERN)).toEqual(['plugin.aes.title']);
  });
});

describe('labMessages', () => {
  it('merges viz, view, core and producer catalogs per locale', () => {
    const en = labMessages('en', ['xor']);
    const de = labMessages('de', ['xor']);
    expect(en['view.state.title']).toBeTruthy();
    expect(en['plugin.xor.title']).toBeTruthy();
    expect(en['plugin.aes.title']).toBeUndefined();
    expect(de['view.state.title']).not.toBe(en['view.state.title']);
  });
});

describe('viewRenderCases', () => {
  it('covers each locale and lens at the first, middle and last step', () => {
    const cases = viewRenderCases(createFixtureBundle());
    expect(cases).toHaveLength(2 * LENSES.length * 3);
    expect(new Set(cases.map((renderCase) => renderCase.step))).toEqual(new Set([-1, 0, 2]));
    expect(new Set(cases.map((renderCase) => renderCase.locale))).toEqual(new Set(['en', 'de']));
  });

  it('renders only the given lenses', () => {
    const cases = viewRenderCases(createFixtureBundle(), ['story']);
    expect(cases).toHaveLength(2 * 3);
    expect(cases.every((renderCase) => renderCase.lens === 'story')).toBe(true);
  });
});

describe('lensesToRender', () => {
  it('renders every lens for a lens-aware view, else one', () => {
    expect(lensesToRender(['story'])).toEqual(LENSES);
    expect(lensesToRender(undefined)).toEqual(['cryptographer']);
    expect(lensesToRender([])).toEqual(['cryptographer']);
  });
});

describe('renderViewProblems', () => {
  let xor: NamedBundle;
  beforeAll(async () => {
    xor = (await primitiveFixtureBundles(primitiveManifests.filter((manifest) => manifest.id === 'xor')))[0]!;
  });

  it('renders a real view without problems when every catalog is loaded', async () => {
    expect(renderViewProblems(await stateView(), xor.bundle, { locale: 'de', lens: 'engineer', step: 1 }, labMessages('de', ['xor']))).toEqual([]);
  });

  it('reports raw keys with locale, lens and step when catalogs are missing', async () => {
    const problems = renderViewProblems(await stateView(), xor.bundle, { locale: 'en', lens: 'story', step: 0 }, {});
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatch(/^raw i18n key "(?:view|plugin|ui|core)\..+" at en\/story\/step 0$/);
  });

  it('lets render errors throw', () => {
    const Broken: ViewComponent = () => {
      throw new Error('boom');
    };
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(() => renderViewProblems(Broken, xor.bundle, { locale: 'en', lens: 'story', step: 0 }, {})).toThrow('boom');
    } finally {
      console.error = quiet;
    }
  });
});
