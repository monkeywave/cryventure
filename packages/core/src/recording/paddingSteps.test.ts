import { describe, expect, it } from 'vitest';
import { padStep, unpadStep } from './paddingSteps.ts';

const NS = 'plugin.demo';

describe('padStep', () => {
  it('writes the pad bytes after the data and narrates count and value', () => {
    const { step, padded } = padStep(NS, [1, 2, 3], 4);
    expect(padded).toEqual([1, 2, 3, 1]);
    expect(step).toEqual({
      op: 'pad',
      writes: [{ region: 'input', offset: 3, values: [1] }],
      highlights: [{ region: 'input', indices: [3], kind: 'write' }],
      narration: { key: `${NS}.step.pad`, params: { count: 1, byte: '01', length: 4 } },
    });
  });

  it('adds a whole block to block-aligned data', () => {
    expect(padStep(NS, [1, 2, 3, 4], 4).padded).toEqual([1, 2, 3, 4, 4, 4, 4, 4]);
  });
});

describe('unpadStep', () => {
  it('marks valid padding and strips it', () => {
    const { step, result } = unpadStep(NS, [9, 9, 2, 2], 4);
    expect(result).toEqual({ ok: true, data: Uint8Array.of(9, 9), padLength: 2 });
    expect(step).toEqual({
      op: 'unpad',
      writes: [],
      highlights: [{ region: 'output', indices: [2, 3], kind: 'read' }],
      narration: { key: `${NS}.step.unpad`, params: { count: 2, byte: '02', length: 2 } },
    });
  });

  it.each([
    [[9, 9, 9, 0], 'zero-pad-byte', {}, [3]],
    [[9, 9, 9, 5], 'pad-too-long', { byte: '05', blockSize: 4 }, [3]],
    [[9, 7, 3, 3], 'inconsistent-pad-bytes', { byte: '03', index: 1, found: '07' }, [1, 3]],
  ])('narrates why %j is invalid (%s) without failing', (output, reason, params, indices) => {
    const { step, result } = unpadStep(NS, output, 4);
    expect(result.ok).toBe(false);
    expect(step.narration).toEqual({ key: `${NS}.step.unpadInvalid.${reason}`, params });
    expect(step.highlights).toEqual([{ region: 'output', indices, kind: 'read' }]);
  });
});
