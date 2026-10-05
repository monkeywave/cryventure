import { toHex, utf8Bytes, type MacFunction } from '@cryventure/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { pbkdf2, pbkdf2Block } from './pbkdf2.ts';
import { iterationRecording, pbkdf2Cost, PBKDF2_SCOPE_LEVELS, recordPbkdf2, type Pbkdf2Input } from './record.ts';
import { macMember } from '../testing/hmacPorts.ts';

const NS = 'plugin.pbkdf2';
let sha1: MacFunction;

beforeAll(async () => {
  sha1 = await macMember('sha1:hmac-sha-1');
});

const ascii = (text: string): number[] => Array.from(utf8Bytes(text));

function input(iterations: number, length = 20, password = ascii('password'), salt = ascii('salt')): Pbkdf2Input {
  return { mac: sha1, password, salt, iterations, length };
}

const opsOf = (iterations: number, length = 20) => recordPbkdf2(input(iterations, length)).state.steps.map((step) => step.op);

describe('iterationRecording', () => {
  it('shows every iteration up to c = 8', () => {
    for (const c of [1, 2, 8]) expect(Array.from({ length: c }, (_, k) => iterationRecording(k + 1, c))).toEqual(Array(c).fill('shown'));
  });

  it('above c = 8 shows 1–3 and c, skips once at c − 1 and hides the rest', () => {
    expect(Array.from({ length: 10 }, (_, k) => iterationRecording(k + 1, 10))).toEqual(['shown', 'shown', 'shown', 'hidden', 'hidden', 'hidden', 'hidden', 'hidden', 'skip', 'shown']);
    expect(iterationRecording(9, 9)).toBe('shown');
    expect(iterationRecording(8, 9)).toBe('skip');
    expect(iterationRecording(4, 9)).toBe('hidden');
  });
});

describe('pbkdf2Cost', () => {
  it('counts l · c calls at two compressions each when S ‖ INT(i) fits one block', () => {
    expect(pbkdf2Cost(sha1, 4, 2, 4096)).toEqual({ calls: 8192, compressions: 16384 });
  });

  it('HMAC-SHA-256, 128-byte salt, c = 1: U1 costs 3 inner + 1 outer compressions', async () => {
    const sha256 = await macMember('sha256:hmac-sha-256');
    expect(pbkdf2Cost(sha256, 128, 1, 1)).toEqual({ calls: 1, compressions: 4 });
    expect(pbkdf2Cost(sha256, 128, 2, 3)).toEqual({ calls: 6, compressions: 2 * (4 + 2 * 2) });
  });

  it('MD padding (0x80 + 8-byte length, B = 64): S ‖ INT(i) of 55 bytes fits, 56 does not', async () => {
    const sha256 = await macMember('sha256:hmac-sha-256');
    expect(pbkdf2Cost(sha256, 51, 1, 1).compressions).toBe(2);
    expect(pbkdf2Cost(sha256, 52, 1, 1).compressions).toBe(3);
  });

  it('SHA-512 (B = 128, 16-byte length field): 111 bytes fit, 112 do not', async () => {
    const sha512 = await macMember('sha512:hmac-sha-512');
    expect(pbkdf2Cost(sha512, 107, 1, 1).compressions).toBe(2);
    expect(pbkdf2Cost(sha512, 108, 1, 1).compressions).toBe(3);
    expect(pbkdf2Cost(sha512, 108, 1, 5).compressions).toBe(3 + 4 * 2);
  });

  it('SHA3 (B = rate, pad10*1 ≥ 1 byte): SHA3-256 fits 135 bytes, SHA3-512 fits 71', async () => {
    const sha3256 = await macMember('sha3:hmac-sha3-256');
    const sha3512 = await macMember('sha3:hmac-sha3-512');
    expect(pbkdf2Cost(sha3256, 131, 1, 1).compressions).toBe(2);
    expect(pbkdf2Cost(sha3256, 132, 1, 1).compressions).toBe(3);
    expect(pbkdf2Cost(sha3512, 67, 1, 2).compressions).toBe(2 + 2);
    expect(pbkdf2Cost(sha3512, 68, 1, 2).compressions).toBe(3 + 2);
  });
});

describe('recordPbkdf2: cost narration', () => {
  it('narrates the exact count: HMAC-SHA-256, 128-byte salt, c = 1 → 4 compressions', async () => {
    const sha256 = await macMember('sha256:hmac-sha-256');
    const recording = recordPbkdf2({ mac: sha256, password: ascii('password'), salt: Array(128).fill(0x73), iterations: 1, length: 32 });
    expect(recording.state.steps.at(-1)?.narration).toEqual({ key: `${NS}.step.output`, params: { length: 32, count: 1, iterations: 1, calls: 1, compressions: 4, mac: 'HMAC-SHA-256' } });
  });
});

describe('recordPbkdf2: step selection', () => {
  it('c = 1: u1, block, output', () => {
    expect(opsOf(1)).toEqual(['u1', 'block', 'output']);
  });

  it('c ≤ 8: every iteration as u + xor', () => {
    expect(opsOf(8)).toEqual(['u1', ...Array(7).fill(['u', 'xor']).flat(), 'block', 'output']);
  });

  it('c > 8: the first three, one skip, the last', () => {
    expect(opsOf(9)).toEqual(['u1', 'u', 'xor', 'u', 'xor', 'skip', 'u', 'xor', 'block', 'output']);
    expect(opsOf(4096)).toEqual(opsOf(9));
  });

  it('repeats the iterations per block (dkLen 25 with SHA-1: two blocks)', () => {
    expect(opsOf(2, 25)).toEqual(['u1', 'u', 'xor', 'block', 'u1', 'u', 'xor', 'block', 'output']);
  });

  it('scopes block → iteration; the skip sits at iteration c − 1, block and output above', () => {
    const steps = recordPbkdf2(input(100)).state.steps;
    expect(steps.map((step) => step.scope)).toEqual([[0, 0], [0, 1], [0, 1], [0, 2], [0, 2], [0, 98], [0, 99], [0, 99], [0], []]);
  });
});

describe('recordPbkdf2: values', () => {
  it('derives the same key as the untraced pbkdf2', () => {
    const recording = recordPbkdf2(input(20, 45));
    expect(toHex(recording.dk)).toBe(toHex(pbkdf2(sha1, Uint8Array.from(ascii('password')), Uint8Array.from(ascii('salt')), 20, 45)));
  });

  it('shows the real U and F after iteration c − 1 at the skip step', () => {
    const c = 50;
    const expected: Record<number, { u: string; f: string }> = {};
    pbkdf2Block(sha1.create(Uint8Array.from(ascii('password'))), Uint8Array.from(ascii('salt')), 1, c, (j, u, f) => {
      expected[j] = { u: toHex(u), f: toHex(f) };
    });
    const skip = recordPbkdf2(input(c)).state.steps.find((step) => step.op === 'skip')!;
    expect(skip.writes.map((write) => [write.region, toHex(write.values)])).toEqual([['u', expected[c - 1]!.u], ['f', expected[c - 1]!.f]]);
    expect(skip.narration).toEqual({ key: `${NS}.step.skip`, params: { first: 4, last: c - 1, hidden: c - 4 } });
  });

  it('records the U chain and block steps it shows', () => {
    const recording = recordPbkdf2(input(100));
    expect(recording.blocks[0]!.us.map((u) => [u.j, u.skipped, recording.state.steps[u.step]!.op])).toEqual([
      [1, false, 'u1'],
      [2, false, 'u'],
      [3, false, 'u'],
      [99, true, 'skip'],
      [100, false, 'u'],
    ]);
    expect(recording.state.steps[recording.blocks[0]!.step]!.op).toBe('block');
    expect(recording.state.steps[recording.outputStep]!.op).toBe('output');
  });

  it('writes only the needed bytes of the last block and says so', () => {
    const steps = recordPbkdf2(input(1, 25)).state.steps.filter((step) => step.op === 'block');
    expect(steps.map((step) => [step.writes[0]!.offset, step.writes[0]!.values.length, step.narration?.key])).toEqual([
      [0, 20, `${NS}.step.block`],
      [20, 5, `${NS}.step.blockTruncated`],
    ]);
  });
});

describe('recordPbkdf2: regions and labels', () => {
  it('omits empty password and salt regions', () => {
    const regions = (password: number[], salt: number[]) => recordPbkdf2(input(1, 20, password, salt)).state.regions.map((region) => region.id);
    expect(regions(ascii('p'), ascii('s'))).toEqual(['password', 'salt', 'u', 'f', 'dk']);
    expect(regions([], [])).toEqual(['u', 'f', 'dk']);
  });

  it('labels the scope levels block and iteration', () => {
    expect(recordPbkdf2(input(1)).state.scopeLevels).toEqual(PBKDF2_SCOPE_LEVELS);
    expect(PBKDF2_SCOPE_LEVELS.map((level) => level.labelKey)).toEqual([`${NS}.scope.block`, `${NS}.scope.iteration`]);
  });
});
