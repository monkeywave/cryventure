import { describe, expect, it } from 'vitest';
import { i18nRef } from '../i18n.ts';
import { isWireSegmentAvailable, wireActiveOffsetsAt, wireIssues, wireLabelRefs, wireTotalLength, type WireFacet, type WireSegment } from './wire.ts';

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
  it('accepts an aad segment', () => {
    expect(wireIssues(wire({ segments: [segment('aad', 'aad', 4), segment('c0', 'ciphertext', 2), segment('tag', 'tag', 16)] }), 1)).toEqual([]);
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

describe('availableAt', () => {
  const later = (availableAt: number): WireSegment => ({ ...segment('c1', 'ciphertext', 1), availableAt });
  it('accepts availableAt within -1..stepCount-1', () => {
    expect(wireIssues(wire({ segments: [segment('iv', 'iv', 1), later(-1)] }), 3)).toEqual([]);
    expect(wireIssues(wire({ segments: [segment('iv', 'iv', 1), later(2)] }), 3)).toEqual([]);
  });
  it('rejects availableAt outside the steps or not an integer', () => {
    expect(wireIssues(wire({ segments: [later(3)] }), 3)).toEqual(['wire: segment "c1" availableAt 3 outside -1..2']);
    expect(wireIssues(wire({ segments: [later(-2)] }), 3)).toEqual(['wire: segment "c1" availableAt -2 outside -1..2']);
    expect(wireIssues(wire({ segments: [later(0.5)] }), 3)).toEqual(['wire: segment "c1" availableAt 0.5 outside -1..2']);
  });
  it('treats a segment as present from availableAt on, and always when absent', () => {
    expect(isWireSegmentAvailable(segment('iv', 'iv', 1), -1)).toBe(true);
    expect(isWireSegmentAvailable(later(2), 1)).toBe(false);
    expect(isWireSegmentAvailable(later(2), 2)).toBe(true);
    expect(isWireSegmentAvailable(later(-1), -1)).toBe(true);
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

describe('wireTotalLength / wireLabelRefs', () => {
  it('sums segment bytes', () => {
    expect(wireTotalLength(wire())).toBe(5);
    expect(wireTotalLength(wire({ segments: [] }))).toBe(0);
  });
  it('lists segment labels', () => {
    expect(wireLabelRefs(wire()).map((ref) => ref.key)).toEqual(['wire.iv', 'wire.ciphertext']);
  });
});
