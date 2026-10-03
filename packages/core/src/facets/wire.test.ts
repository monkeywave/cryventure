import { describe, expect, it } from 'vitest';
import { i18nRef } from '../i18n.ts';
import { wireActiveOffsetsAt, wireIssues, wireLabelRefs, wireSegmentAt, wireTotalLength, type WireFacet, type WireSegment } from './wire.ts';

const segment = (id: string, role: WireSegment['role'], length: number): WireSegment => ({
  id,
  role,
  label: i18nRef(`wire.${role}`),
  bytes: Array.from({ length }, (_, index) => index),
});

const wire = (extra: Partial<WireFacet> = {}): WireFacet => ({
  kind: 'wire',
  schemaVersion: 1,
  segments: [segment('iv', 'iv', 2), segment('c0', 'ciphertext', 3)],
  ...extra,
});

describe('wireIssues', () => {
  it('accepts a well-formed wire with flip and activeAt', () => {
    const facet = wire({
      flip: { param: 'flip', maskHex: '0000000000' },
      activeAt: [{ step: -1, offsets: [] }, { step: 0, offsets: [0, 1] }, { step: 2, offsets: [4] }],
    });
    expect(wireIssues(facet, 3)).toEqual([]);
  });
  it('rejects duplicate segment ids', () => {
    expect(wireIssues(wire({ segments: [segment('a', 'iv', 1), segment('a', 'tag', 1)] }), 1)).toEqual(['wire: duplicate segment id "a"']);
  });
  it('rejects a flip mask that is not lowercase hex of the total length', () => {
    expect(wireIssues(wire({ flip: { param: 'flip', maskHex: '00' } }), 1)).toEqual(['wire: flip mask is 1 bytes, segments total 5']);
    expect(wireIssues(wire({ flip: { param: 'flip', maskHex: '00000000FF' } }), 1)).toEqual(['wire: flip mask "00000000FF" is not lowercase hex']);
    expect(wireIssues(wire({ flip: { param: 'flip', maskHex: '000000000' } }), 1)).toEqual(['wire: flip mask "000000000" is not lowercase hex']);
  });
  it('rejects non-increasing or out-of-range activeAt steps', () => {
    const facet = wire({ activeAt: [{ step: 1, offsets: [] }, { step: 1, offsets: [] }, { step: 3, offsets: [] }] });
    expect(wireIssues(facet, 3)).toEqual(['wire: activeAt step 1 does not follow step 1', 'wire: activeAt step 3 outside -1..2']);
    expect(wireIssues(wire({ activeAt: [{ step: -2, offsets: [] }] }), 3)).toEqual(['wire: activeAt step -2 outside -1..2']);
  });
  it('rejects offsets outside the total length', () => {
    expect(wireIssues(wire({ activeAt: [{ step: 0, offsets: [4, 5, -1] }] }), 1)).toEqual([
      'wire: activeAt step 0 offset 5 outside 0..4',
      'wire: activeAt step 0 offset -1 outside 0..4',
    ]);
  });
});

describe('wireActiveOffsetsAt', () => {
  const facet = wire({ activeAt: [{ step: 0, offsets: [0, 1] }, { step: 2, offsets: [4] }] });
  it('returns the latest entry at or before the step', () => {
    expect(wireActiveOffsetsAt(facet, 0)).toEqual([0, 1]);
    expect(wireActiveOffsetsAt(facet, 1)).toEqual([0, 1]);
    expect(wireActiveOffsetsAt(facet, 5)).toEqual([4]);
  });
  it('returns nothing before the first entry or without activeAt', () => {
    expect(wireActiveOffsetsAt(facet, -1)).toEqual([]);
    expect(wireActiveOffsetsAt(wire(), 3)).toEqual([]);
  });
});

describe('wireTotalLength / wireSegmentAt / wireLabelRefs', () => {
  it('sums segment bytes', () => {
    expect(wireTotalLength(wire())).toBe(5);
    expect(wireTotalLength(wire({ segments: [] }))).toBe(0);
  });
  it('maps a global offset to its segment and local index', () => {
    const [iv, c0] = wire().segments;
    expect(wireSegmentAt(wire(), 0)).toEqual({ segment: iv, index: 0, start: 0, byteIndex: 0 });
    expect(wireSegmentAt(wire(), 1)).toEqual({ segment: iv, index: 0, start: 0, byteIndex: 1 });
    expect(wireSegmentAt(wire(), 2)).toEqual({ segment: c0, index: 1, start: 2, byteIndex: 0 });
    expect(wireSegmentAt(wire(), 4)).toEqual({ segment: c0, index: 1, start: 2, byteIndex: 2 });
    expect(wireSegmentAt(wire(), 5)).toBeUndefined();
    expect(wireSegmentAt(wire(), -1)).toBeUndefined();
  });
  it('lists segment labels', () => {
    expect(wireLabelRefs(wire()).map((ref) => ref.key)).toEqual(['wire.iv', 'wire.ciphertext']);
  });
});
