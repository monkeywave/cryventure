import { toHex } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { sharedShaFixtureBundle } from './fixtures/shaBundles.ts';
import {
  expectLanes,
  laneBytes,
  registerBytes,
  ShaRegisterFile,
  type ShaBlockContext,
} from './shaRegisters.ts';
import { shaTrace } from './shaTrace.ts';
import { varLanes, word } from './shaWords.ts';

const trace = shaTrace(sharedShaFixtureBundle('sha-256-abc'));
const context: ShaBlockContext = { trace, block: trace.blocks[0]! };
const hex = (lane: Parameters<typeof laneBytes>[1]) => toHex(laneBytes(context, lane));

describe('lane bytes from the trace (memory order, little-endian lanes)', () => {
  it('reverses traced words and keeps loaded block bytes and literals', () => {
    expect(hex(word.var('a', -1))).toBe('67e6096a');
    expect(hex(word.var('a', 0))).toBe(toHex([0xcd, 0xeb, 0x6a, 0x5d]));
    expect(hex(word.w(0))).toBe('80636261');
    expect(hex(word.wBytes(0))).toBe('61626380');
    expect(hex(word.w(16))).toBe('80636261');
    expect(hex(word.kw(0))).toBe('1893eca3');
    expect(hex(word.k(1))).toBe('91443771');
    expect(hex(word.h('a'))).toBe('bf1678ba');
    expect(hex({ kind: 'const', bytes: [3, 2, 1, 0] })).toBe('03020100');
  });

  it('reads p1 and p2 from the schedule step (W16 = p2 + σ1(W14) = p2, since W14 = 0)', () => {
    expect(hex(word.p2(16))).toBe(hex(word.w(16)));
    expect(hex(word.p1(16))).toBe(hex(word.w(0)));
  });

  it('concatenates lanes, lane 0 first', () => {
    expect(toHex(registerBytes(context, varLanes(['f', 'e', 'b', 'a'], -1)))).toBe(
      '8c68059b7f520e5185ae67bb67e6096a',
    );
  });
});

describe('64-bit lane bytes from a SHA-512 trace', () => {
  const trace512 = shaTrace(sharedShaFixtureBundle('sha-512-abc'));
  const context512: ShaBlockContext = { trace: trace512, block: trace512.blocks[0]! };
  const hex512 = (lane: Parameters<typeof laneBytes>[1]) => toHex(laneBytes(context512, lane));

  it('reverses 8-byte words and reads hKW and T1 from the round terms', () => {
    expect(hex512(word.var('a', -1))).toBe('08c9bcf367e6096a');
    expect(hex512(word.wBytes(0))).toBe('6162638000000000');
    expect(hex512(word.hKW(0))).toBe('9bcfa6ea3160cdff');
    expect(hex512(word.T1(0))).toBe('a0e8971bfa0c7bb3');
    expect(hex512(word.w(79))).toHaveLength(16);
  });

  it('has no bytes for an untraced partial sum', () => {
    const partial = { kind: 'partial' as const, left: word.var('c', 77), right: word.var('e', -1) };
    expect(() => laneBytes(context512, partial)).toThrow(
      'the trace records no value for (c@77+e@-1)',
    );
  });
});

describe('ShaRegisterFile and expectLanes', () => {
  it('throws on a read before any write', () => {
    const registers = new ShaRegisterFile();
    expect(() => registers.read('xmm1')).toThrow(/xmm1 is read before it is written/);
    registers.write('xmm1', [word.w(0)]);
    expect(registers.read('xmm1')).toEqual([word.w(0)]);
  });

  it('checks the expected lanes through the round shift and skips undefined ones', () => {
    expect(() =>
      expectLanes(varLanes(['h', 'g', 'd', 'c'], 1), varLanes(['f', 'e', 'b', 'a'], -1), 'x'),
    ).not.toThrow();
    expect(() => expectLanes([word.w(0), word.w(9)], [undefined, word.w(9)], 'x')).not.toThrow();
    expect(() => expectLanes([word.w(0)], [word.w(1)], 'xmm3 must hold W1')).toThrow(
      'xmm3 must hold W1: expected [W1], holds [W0]',
    );
    expect(() => expectLanes([], [word.w(1)], 'empty')).toThrow(/empty/);
  });
});
