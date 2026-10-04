import { i18nRef, utf8Bytes, type AnyStateFacet, type NarrationFacet, type PrimitiveRecording } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { SHA512_ALGORITHMS, type Sha2Algorithm } from '../_lib/sha2/algorithms.ts';
import { recordSha2 } from '../_lib/sha2/record.ts';

/** The SHA-512/t IV generation function (FIPS 180-4 §5.3.6) narrates its intro, first init and output as such. */
const NS = 'plugin.test';
const GENERATOR = SHA512_ALGORITHMS['sha-512/t-iv'];
/** The same algorithm without `ivGeneration`: narrated like any SHA-2 run. */
const { ivGeneration: _ivGeneration, ...PLAIN }: Sha2Algorithm<bigint> = GENERATOR;
const record = (algorithm: Sha2Algorithm<bigint>, text: string): PrimitiveRecording => recordSha2({ ns: NS, algorithm, message: Array.from(utf8Bytes(text)), detail: 'block' });
const stateOf = (recording: PrimitiveRecording) => recording.facets.state as AnyStateFacet;

describe('SHA-512/t IV generation narration', () => {
  const plain = record(PLAIN, 'SHA-512/256');
  const explained = record(GENERATOR, 'SHA-512/256');

  it('narrates the intro as IV generation, keeping its params but the algorithm name', () => {
    const { algorithm: _algorithm, ...params } = stateOf(plain).initialNarration!.params!;
    expect(stateOf(explained).initialNarration).toEqual(i18nRef(`${NS}.step.initialIvGeneration`, params));
  });

  it('explains H(0)″ = H(0) ⊕ a5a5… at the first init step', () => {
    const init = stateOf(explained).steps[1]!;
    expect(init.op).toBe('init');
    expect(init.narration.key).toBe(`${NS}.step.initFirstIvGeneration`);
    expect(init.narration.params).toMatchObject({ mask: 'a5a5a5a5a5a5a5a5', h: stateOf(plain).steps[1]!.narration.params!['h'] });
    expect(String(init.narration.params!['base'])).toBe('6a09e667f3bcc908 bb67ae8584caa73b 3c6ef372fe94f82b a54ff53a5f1d36f1 510e527fade682d1 9b05688c2b3e6c1f 1f83d9abfb41bd6b 5be0cd19137e2179');
    expect(init.narration.params).not.toHaveProperty('algorithm');
  });

  it('narrates the output as IV generation and leaves every other step, and the output, unchanged', () => {
    const steps = stateOf(explained).steps;
    expect(steps.at(-1)!.narration.key).toBe(`${NS}.step.outputIvGeneration`);
    expect(steps.at(-1)!.narration.params).not.toHaveProperty('algorithm');
    const untouched = (state: AnyStateFacet) => state.steps.filter((_, index) => index !== 1 && index !== state.steps.length - 1);
    expect(untouched(stateOf(explained))).toEqual(untouched(stateOf(plain)));
    expect(explained.output).toEqual(plain.output);
    expect(explained.facets.wordops).toEqual(plain.facets.wordops);
  });

  it('builds the narration facet from the IV generation texts', () => {
    const entries = (explained.facets.narration as NarrationFacet).entries;
    expect(entries.map((entry) => entry.ref.key).filter((key) => key.endsWith('IvGeneration'))).toEqual([`${NS}.step.initialIvGeneration`, `${NS}.step.initFirstIvGeneration`, `${NS}.step.outputIvGeneration`]);
  });

  it('only renarrates the first init of a multi-block input', () => {
    const inits = stateOf(record(GENERATOR, 'x'.repeat(120))).steps.filter((step) => step.op === 'init');
    expect(inits.map((step) => step.narration.key)).toEqual([`${NS}.step.initFirstIvGeneration`, `${NS}.step.init`]);
  });
});
