import { getFacet, type PrimitiveManifest, type RunResult, type WordopsFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';

/**
 * The story lens of a wordops v2 facet shows only the terms marked `emphasis: 'story'`: every step
 * that computes a `result` term must give the story learner at least one of them.
 */

type ProducerModule = { run: (params: never) => RunResult };

const manifests = import.meta.glob<{ default: PrimitiveManifest }>('./*/manifest.ts', { eager: true });
const modules = import.meta.glob<ProducerModule>('./*/module.ts', { eager: true });

/** The wordops v2 facet of a run (none for producers that need ports or record no word ops). */
function wordopsOf(result: RunResult): WordopsFacet | undefined {
  const facet = result.ok ? getFacet<WordopsFacet>(result.trace, 'wordops') : undefined;
  return facet?.schemaVersion === 2 ? facet : undefined;
}

/** Every (producer, preset) whose recording carries a wordops v2 facet. */
const cases = Object.entries(manifests).flatMap(([path, { default: manifest }]) => {
  const module = modules[path.replace('manifest.ts', 'module.ts')];
  if (module === undefined) return [];
  return manifest.presets.flatMap((preset) => {
    const facet = wordopsOf(module.run(preset.params as never));
    return facet === undefined ? [] : [{ producer: manifest.id, name: `${manifest.id} ${preset.id}`, facet }];
  });
});

describe('wordops v2 story emphasis', () => {
  it('covers the word-op producers', () => {
    const producers = new Set(cases.map((testCase) => testCase.producer));
    expect([...producers].sort()).toEqual(expect.arrayContaining(['blake2', 'keccak-constants', 'md5', 'sha1', 'sha2-constants', 'sha256', 'sha512']));
  });

  it.each(cases)('$name: every step with a result term has a story term', ({ facet }) => {
    const missing = facet.steps.filter((step) => step.terms.some((term) => term.role === 'result') && !step.terms.some((term) => term.emphasis === 'story'));
    expect(missing.map((step) => `step ${step.step}: ${step.terms.filter((term) => term.role === 'result').map((term) => term.id).join(', ')}`)).toEqual([]);
  });
});
