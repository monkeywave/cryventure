import { describe, expect, it } from 'vitest';
import { BlockOpRecorder } from './blockOpRecorder.ts';

type Op = { op: 'set' };
const regions = [{ id: 'r' as const, labelKey: 'x.r', elem: 'u8' as const, shape: [2] }];
const narration = { key: 'x.step' };
const set = (offset: number) => ({ op: 'set' as const, writes: [{ region: 'r' as const, offset, values: [offset + 1] }], highlights: [], narration });

describe('BlockOpRecorder', () => {
  it('scopes steps block → op, returns each step index and keeps the initial narration', () => {
    const recorder = new BlockOpRecorder<'r', Op>(regions, { r: [0, 0] }, { key: 'x.initial' });
    const indices = [0, 1].map((block) => recorder.block(block, () => [recorder.op(set(block)), recorder.op(set(block))]));
    expect(indices).toEqual([[0, 1], [2, 3]]);
    const facet = recorder.toFacet();
    expect(facet.steps.map((step) => step.scope)).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
    expect(facet.initialNarration).toEqual({ key: 'x.initial' });
  });
});
