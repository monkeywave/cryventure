import { stateAt, toHex, validateWordopsFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { ROUND_CONSTANTS } from '../_lib/keccak/constants.ts';
import { deriveRoundConstant } from './lfsr.ts';
import { rcRegions, recordRoundConstants, roundConstantBytes, roundTerms, roundValueId } from './rcTrace.ts';

const NS = 'plugin.keccak-constants';

describe('roundConstantBytes', () => {
  it('stores RC most significant byte first', () => expect(roundConstantBytes(0x800000000000808an)).toEqual([0x80, 0, 0, 0, 0, 0, 0x80, 0x8a]));
});

describe('rcRegions', () => {
  it('has a one-byte LFSR register (not blank) and 24 blank big-endian RC words', () => {
    const [lfsr, rc] = rcRegions(24);
    expect(lfsr).toEqual({ id: 'lfsr', labelKey: `${NS}.region.lfsr`, elem: 'u8', shape: [1] });
    expect(rc).toEqual({ id: 'rc', labelKey: `${NS}.region.rc`, elem: 'u8', shape: [192], initial: 'blank', layout: { kind: 'words', wordBytes: 8, labelPrefix: 'RC', wordsPerGroup: 4, byteOrder: 'big' } });
  });
});

describe('roundValueId', () => {
  it('scopes the value by round', () => expect(roundValueId(3)).not.toBe(roundValueId(4)));
});

describe('roundTerms', () => {
  it('lists the seven placed LFSR bits, then RC[i] as the story result', () => {
    const terms = roundTerms(deriveRoundConstant(2));
    expect(terms.map((term) => term.id)).toEqual(['rc14', 'rc15', 'rc16', 'rc17', 'rc18', 'rc19', 'rc20', 'RC']);
    expect(terms.at(-1)).toEqual({ id: 'RC', label: { key: `${NS}.term.rc`, params: { round: 2 } }, hex: '800000000000808a', role: 'result', op: 'or', emphasis: 'story', valueRef: roundValueId(2) });
    expect(terms[6]).toEqual({ id: 'rc20', label: { key: `${NS}.term.rcBit`, params: { t: 20, bit: 1, position: 63 } }, hex: '8000000000000000', role: 'operand' });
    expect(terms.filter((term) => term.emphasis === 'story')).toHaveLength(1);
  });
});

describe('recordRoundConstants', () => {
  const recording = recordRoundConstants(ROUND_CONSTANTS);

  it('records one round step per constant and a final comparison', () => {
    expect(recording.state.steps.map((step) => step.op)).toEqual([...new Array<string>(24).fill('round'), 'compare']);
    expect(recording.mismatches).toEqual([]);
    expect(recording.state.steps.at(-1)?.narration).toEqual({ key: `${NS}.step.rcMatch`, params: { rounds: 24 } });
  });

  it('writes the register and RC[i] in round i', () => {
    expect(recording.state.steps[1]?.writes).toEqual([
      { region: 'lfsr', offset: 0, values: [deriveRoundConstant(1).registerAfter] },
      { region: 'rc', offset: 8, values: [0, 0, 0, 0, 0, 0, 0x80, 0x82] },
    ]);
  });

  it('ends with the whole table in the rc region and starts the register at 01', () => {
    expect(stateAt(recording.state, -1).lfsr).toEqual([0x01]);
    expect(toHex(stateAt(recording.state, 23).rc)).toBe(ROUND_CONSTANTS.map((rc) => rc.toString(16).padStart(16, '0')).join(''));
  });

  it('narrates the seven bits, the word and the register', () => {
    expect(recording.state.steps[0]?.narration).toEqual({ key: `${NS}.step.round`, params: { round: 0, tFirst: 0, tLast: 6, bits: '1 0 0 0 0 0 0', word: '0000000000000001', register: deriveRoundConstant(0).registerAfter.toString(2).padStart(8, '0').split('').reverse().join('') } });
  });

  it('emits a valid 64-bit wordops v2 facet, one step per round', () => {
    expect(validateWordopsFacet(recording.wordops, recording.state.steps.length)).toEqual([]);
    expect(recording.wordops).toMatchObject({ schemaVersion: 2, wordBits: 64 });
    expect(recording.wordops.steps.map((step) => step.step)).toEqual(Array.from({ length: 24 }, (_, round) => round));
    expect(recording.wordops.steps[5]?.formula).toEqual({ key: `${NS}.math.round`, params: { round: 5, tBase: 35 } });
  });

  it('narrates a mismatch against a wrong reference', () => {
    const wrong = ROUND_CONSTANTS.map((rc, round) => (round === 7 ? 0n : rc));
    const mismatched = recordRoundConstants(wrong);
    expect(mismatched.mismatches).toEqual([7]);
    expect(mismatched.state.steps.at(-1)?.narration).toEqual({ key: `${NS}.step.rcMismatch`, params: { rounds: 24, mismatches: 1 } });
  });
});
