import { stateAt, toHex, utf8Bytes, type AnyStateFacet, type ValuesFacet, type WordopsFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { SHA256_ALGORITHMS, SHA512_ALGORITHMS, type Sha2Algorithm } from './algorithms.ts';
import type { Sha2Detail } from './manifestKit.ts';
import { recordSha2, sha2MessageBytes } from './record.ts';
import type { Word } from './words.ts';

const NS = 'plugin.test';
const MSG_448 = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
const MSG_896 = 'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu';

function record<W extends Word>(algorithm: Sha2Algorithm<W>, text: string, detail: Sha2Detail = 'round') {
  const recording = recordSha2({ ns: NS, algorithm, message: Array.from(utf8Bytes(text)), detail });
  const { state, values, wordops } = recording.facets as { state: AnyStateFacet; values: ValuesFacet; wordops: WordopsFacet };
  return { recording, state, values, wordops };
}

describe('sha2MessageBytes', () => {
  it('reads UTF-8 text or normalised hex', () => {
    expect(sha2MessageBytes('utf8', 'aä')).toEqual([0x61, 0xc3, 0xa4]);
    expect(sha2MessageBytes('hex', '616263')).toEqual([0x61, 0x62, 0x63]);
    expect(sha2MessageBytes('hex', '')).toEqual([]);
  });
});

describe('recordSha2', () => {
  it('outputs the digest and the state, values, narration and wordops facets', () => {
    const { recording, state } = record(SHA256_ALGORITHMS['sha-256'], 'abc');
    expect(toHex(recording.output['digest']!)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(Object.keys(recording.facets).sort()).toEqual(['narration', 'state', 'values', 'wordops']);
    expect(state.initialNarration).toEqual({ key: `${NS}.step.initial`, params: { algorithm: 'SHA-256', bytes: 3, bits: 256, blockBits: 512, rounds: 64 } });
    expect(state.scopeLevels?.map((level) => level.labelKey)).toEqual([`${NS}.scope.block`, `${NS}.scope.op`]);
  });

  it('records pad, init, the body, feed-forward per block and output after the last block', () => {
    const { state } = record(SHA512_ALGORITHMS['sha-512'], MSG_896, 'block');
    expect(state.steps.map((step) => step.op)).toEqual(['pad', 'init', 'compress', 'feedForward', 'init', 'compress', 'feedForward', 'output']);
    expect(state.steps.map((step) => step.scope[0])).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
  });

  it('creates the chaining values h/<n> at their feed-forward steps and the digest at the output step', () => {
    const { values, state } = record(SHA256_ALGORITHMS['sha-224'], MSG_448, 'block');
    expect(values.values.map((value) => [value.id, value.createdAt])).toEqual([
      ['message', -1],
      ['iv', -1],
      ['h/1', 3],
      ['h/2', 6],
      ['digest', state.steps.length - 1],
    ]);
    expect(values.values.at(-1)!.bytes).toHaveLength(28);
  });

  it('records the 128-byte message limit as three SHA-256 blocks', () => {
    const { state } = record(SHA256_ALGORITHMS['sha-256'], 'x'.repeat(128), 'block');
    expect(state.steps.filter((step) => step.op === 'init')).toHaveLength(3);
  });
});

/**
 * Regression: the wordops registers and terms describe the state the step leaves behind, so the
 * register view and the state view can never disagree.
 */
describe.each([
  ['SHA-256, one block', SHA256_ALGORITHMS['sha-256'] as Sha2Algorithm<Word>, 'abc'],
  ['SHA-256, two blocks', SHA256_ALGORITHMS['sha-256'] as Sha2Algorithm<Word>, MSG_448],
  ['SHA-512, one block', SHA512_ALGORITHMS['sha-512'] as Sha2Algorithm<Word>, 'abc'],
  ['SHA-512, two blocks', SHA512_ALGORITHMS['sha-512'] as Sha2Algorithm<Word>, MSG_896],
])('%s: every round step agrees with the state', (_name, algorithm, text) => {
  const { state, wordops } = record(algorithm, text);
  const hexBytes = algorithm.params.arith.bytes * 2;
  const words = (bytes: readonly number[]) => toHex(bytes).match(new RegExp(`.{${hexBytes}}`, 'g'))!;
  const rounds = wordops.steps.filter((step) => state.steps[step.step]!.op === 'round');

  it(`has ${algorithm.params.rounds} rounds per block`, () => {
    expect(rounds.length % algorithm.params.rounds).toBe(0);
    expect(rounds.length).toBe(state.steps.filter((step) => step.op === 'init').length * algorithm.params.rounds);
  });

  it('registers.after equals the vars region after the step', () => {
    for (const step of rounds) expect(step.registers?.after, `step ${step.step}`).toEqual(words(stateAt(state, step.step)['vars']!));
  });

  it("the round's W term equals word t of the w region", () => {
    for (const step of rounds) {
      const t = Number(step.formula.params?.['t']);
      expect(step.terms.find((term) => term.id === 'w')!.hex, `step ${step.step}, t = ${t}`).toBe(words(stateAt(state, step.step)['w']!)[t]);
    }
  });
});
