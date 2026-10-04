import { i18nRef, scopeLevels, stateAt, toHex, validateWordopsFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { SHA256_ALGORITHMS, SHA512_ALGORITHMS, type Sha2Algorithm } from './algorithms.ts';
import { compressDetailed, type BlockDetail, type RoundDetail, type ScheduleDetail } from './compress.ts';
import { sha2Padding } from './padding.ts';
import { initialSnapshot, SHA2_REGISTER_NAMES, sha2Regions, type Sha2Region } from './regions.ts';
import { chainingValueId, recordCompress, recordFeedForward, recordInit, recordOutput, recordPad, recordRound, recordSchedule, sha2Trace, type Sha2OpName, type Sha2Trace, type Sha2TraceOptions } from './steps.ts';
import { WordopsRecorder } from './wordopsRecorder.ts';
import { wordsToBytes, type Word } from './words.ts';

const NS = 'plugin.test';
const TWO_BLOCK = Array.from('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', (char) => char.charCodeAt(0));

function setup<W extends Word>(algorithm: Sha2Algorithm<W>, message: number[], options: Sha2TraceOptions = {}) {
  const padding = sha2Padding(message, algorithm.params.blockBytes);
  const regions = sha2Regions(NS, algorithm, message.length, padding.padded.length);
  const recorder = new WordopsRecorder<Sha2Region, { op: Sha2OpName }>(regions, initialSnapshot(regions, { message }), scopeLevels(NS, 'block', 'op'), i18nRef(`${NS}.step.initial`));
  const trace: Sha2Trace<W> = sha2Trace(NS, algorithm, recorder, options);
  const { blockBytes } = algorithm.params;
  const blocks: BlockDetail<W>[] = [];
  let h = [...algorithm.iv];
  for (let offset = 0; offset < padding.padded.length; offset += blockBytes) {
    blocks.push(compressDetailed(algorithm.params, h, padding.padded.subarray(offset, offset + blockBytes)));
    h = blocks.at(-1)!.hOut;
  }
  return { trace, padding, blocks, state: () => recorder.stateFacet(), wordops: (registerNames?: readonly string[]) => recorder.wordopsFacet(algorithm.params.arith.bits, registerNames) };
}

const roundOf = <W extends Word>(block: BlockDetail<W>, t: number) => block.events.find((event): event is RoundDetail<W> => event.kind === 'round' && event.t === t)!;
const scheduleOf = <W extends Word>(block: BlockDetail<W>, t: number) => block.events.find((event): event is ScheduleDetail<W> => event.kind === 'schedule' && event.t === t)!;

describe('chainingValueId', () => {
  it('is "iv" for H(0) and h/<n> for later chaining values', () => {
    expect([chainingValueId(0), chainingValueId(1), chainingValueId(2)]).toEqual(['iv', 'h/1', 'h/2']);
  });
});

describe('recordPad', () => {
  it('writes the padded message and narrates the padding sizes', () => {
    const run = setup(SHA256_ALGORITHMS['sha-256'], [0x61, 0x62, 0x63]);
    expect(recordPad(run.trace, 3, run.padding, run.trace.algorithm.params.blockBytes)).toBe(0);
    const step = run.state().steps[0]!;
    expect(step.op).toBe('pad');
    expect(step.narration).toEqual({ key: `${NS}.step.pad`, params: { bytes: 3, zeros: 52, lengthBits: 64, bits: 24, count: 1, blockBytes: 64 } });
    expect(step.highlights.map((highlight) => [highlight.region, highlight.kind])).toEqual([['message', 'read'], ['padded', 'write']]);
    expect(stateAt(run.state(), 0)['padded']).toEqual(Array.from(run.padding.padded));
  });

  it('reads no message bytes for the empty message', () => {
    const run = setup(SHA512_ALGORITHMS['sha-512'], []);
    recordPad(run.trace, 0, run.padding, run.trace.algorithm.params.blockBytes);
    expect(run.state().steps[0]!.highlights.map((highlight) => highlight.region)).toEqual(['padded']);
    expect(run.state().steps[0]!.narration.params).toMatchObject({ zeros: 111, lengthBits: 128 });
  });
});

describe('recordInit', () => {
  it('block 1 loads H(0) into h and a … h, and W0 … W15 from the block', () => {
    const run = setup(SHA256_ALGORITHMS['sha-256'], TWO_BLOCK);
    recordInit(run.trace, 0, run.blocks[0]!);
    const step = run.state().steps[0]!;
    expect(step.narration).toEqual({ key: `${NS}.step.initFirst`, params: { algorithm: 'SHA-256', h: '6a09e667 bb67ae85 3c6ef372 a54ff53a 510e527f 9b05688c 1f83d9ab 5be0cd19' } });
    expect(step.writes.map((write) => write.region)).toEqual(['h', 'vars', 'w']);
    expect(step.highlights.find((highlight) => highlight.region === 'h')!.kind).toBe('write');
    const snapshot = stateAt(run.state(), 0);
    expect(snapshot['vars']).toEqual(snapshot['h']);
    expect(snapshot['w']!.slice(0, 64)).toEqual(Array.from(run.padding.padded.subarray(0, 64)));
  });

  it('block n ≥ 2 reads H(n−1) and leaves h and W16 … W63 alone', () => {
    const run = setup(SHA256_ALGORITHMS['sha-256'], TWO_BLOCK);
    recordInit(run.trace, 1, run.blocks[1]!);
    const step = run.state().steps[0]!;
    expect(step.narration.key).toBe(`${NS}.step.init`);
    expect(step.narration.params).toMatchObject({ n: 2, prev: 1 });
    expect(step.writes.map((write) => [write.region, write.offset, write.values.length])).toEqual([['vars', 0, 32], ['w', 0, 64]]);
    expect(step.highlights.find((highlight) => highlight.region === 'h')!.kind).toBe('read');
  });

  it('emits register terms linked to the incoming chaining value, then the 16 message words', () => {
    const run = setup(SHA256_ALGORITHMS['sha-256'], TWO_BLOCK);
    recordInit(run.trace, 1, run.blocks[1]!);
    const { terms, formula } = run.wordops().steps[0]!;
    expect(formula).toEqual({ key: `${NS}.formula.init`, params: { n: 2, prev: 1 } });
    expect(terms).toHaveLength(24);
    expect(terms[0]).toMatchObject({ id: 'a', role: 'operand', valueRef: 'h/1', label: { key: `${NS}.term.register`, params: { reg: 'a', j: 0, prev: 1 } } });
    expect(terms[8]).toMatchObject({ id: 'w0', role: 'operand', label: { key: `${NS}.term.message`, params: { j: 0, n: 2 } } });
  });
});

describe('recordSchedule and recordRound', () => {
  it('a schedule step writes W_t at its word offset and reads W(t−2), W(t−7), W(t−15), W(t−16)', () => {
    const run = setup(SHA512_ALGORITHMS['sha-512'], [0x61, 0x62, 0x63]);
    const schedule = scheduleOf(run.blocks[0]!, 16);
    recordSchedule(run.trace, schedule);
    const step = run.state().steps[0]!;
    expect(step.writes).toEqual([{ region: 'w', offset: 128, values: run.trace.algorithm.params.arith.toBytes(schedule.w) }]);
    const read = step.highlights.find((highlight) => highlight.kind === 'read')!;
    expect(new Set(read.indices.map((index) => index >> 3))).toEqual(new Set([14, 9, 1, 0]));
    expect(step.narration.params).toMatchObject({ t: 16, t2: 14, t7: 9, t15: 1, t16: 0, wordBits: 64 });
  });

  it('a round step writes a … h after the round and records the registers before and after', () => {
    const run = setup(SHA256_ALGORITHMS['sha-256'], [0x61, 0x62, 0x63]);
    const round = roundOf(run.blocks[0]!, 0);
    recordRound(run.trace, round);
    const step = run.state().steps[0]!;
    expect(step.writes).toEqual([{ region: 'vars', offset: 0, values: wordsToBytes(run.trace.algorithm.params.arith, round.after) }]);
    expect(step.narration.params).toMatchObject({ t: 0, a: '5d6aebcd', e: 'fa2a4622', kw: 'a3ec9318', wordBits: 32 });
    expect(run.wordops().steps[0]!.registers?.after.slice(0, 1)).toEqual(['5d6aebcd']);
  });

  it('a round step names where every register comes from: the shift, e ← d + T1 and a ← T1 + T2', () => {
    const run = setup(SHA512_ALGORITHMS['sha-512'], [0x61, 0x62, 0x63]);
    recordRound(run.trace, roundOf(run.blocks[0]!, 5));
    expect(run.wordops().steps[0]!.registers?.transfers).toEqual([
      { to: 0, from: { term: 'a' } },
      { to: 1, from: { register: 0 } },
      { to: 2, from: { register: 1 } },
      { to: 3, from: { register: 2 } },
      { to: 4, from: { term: 'e' } },
      { to: 5, from: { register: 4 } },
      { to: 6, from: { register: 5 } },
      { to: 7, from: { register: 6 } },
    ]);
    expect(validateWordopsFacet(run.wordops(SHA2_REGISTER_NAMES))).toEqual([]);
  });

  it('adds the hKW term to rounds only when the trace asks for it', () => {
    const plain = setup(SHA512_ALGORITHMS['sha-512'], [0x61, 0x62, 0x63]);
    recordRound(plain.trace, roundOf(plain.blocks[0]!, 0));
    expect(plain.wordops().steps[0]!.terms.some((term) => term.id === 'hKW')).toBe(false);
    const withHKW = setup(SHA512_ALGORITHMS['sha-512'], [0x61, 0x62, 0x63], { hKW: true });
    recordRound(withHKW.trace, roundOf(withHKW.blocks[0]!, 0));
    expect(withHKW.wordops().steps[0]!.terms.find((term) => term.id === 'hKW')?.hex).toBe('ffcd6031eaa6cf9b');
  });
});

describe('recordCompress, recordFeedForward and recordOutput', () => {
  it('compress writes W16 … W(N−1) and a … h in one step', () => {
    const run = setup(SHA512_ALGORITHMS['sha-384'], [0x61, 0x62, 0x63]);
    recordCompress(run.trace, 0, run.blocks[0]!);
    const step = run.state().steps[0]!;
    expect(step.writes.map((write) => [write.region, write.offset, write.values.length])).toEqual([['w', 128, 64 * 8], ['vars', 0, 64]]);
    expect(step.narration.params).toMatchObject({ n: 1, rounds: 80 });
    expect(run.wordops().steps[0]!.terms).toEqual([]);
  });

  it('feed-forward writes H(n) with one result term per word, linked to h/<n>', () => {
    const run = setup(SHA256_ALGORITHMS['sha-256'], [0x61, 0x62, 0x63]);
    recordFeedForward(run.trace, 0, run.blocks[0]!);
    expect(toHex(stateAt(run.state(), 0)['h']!)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const terms = run.wordops().steps[0]!.terms;
    expect(terms.map((term) => term.valueRef)).toEqual(Array(8).fill('h/1'));
    expect(terms[7]).toMatchObject({ id: 'h7', role: 'result', op: 'add', label: { params: { j: 7, n: 1, reg: 'h', prev: 0 } } });
  });

  it('output narrates the full chaining value, or its truncation', () => {
    const full = setup(SHA256_ALGORITHMS['sha-256'], []);
    recordOutput(full.trace, 1, Array(32).fill(0));
    expect(full.state().steps[0]!.narration).toMatchObject({ key: `${NS}.step.output`, params: { algorithm: 'SHA-256', n: 1, bits: 256 } });
    const truncated = setup(SHA512_ALGORITHMS['sha-512/224'], []);
    recordOutput(truncated.trace, 2, Array(28).fill(0));
    expect(truncated.state().steps[0]!.narration).toMatchObject({ key: `${NS}.step.outputTruncated`, params: { n: 2, bits: 224 } });
  });
});
