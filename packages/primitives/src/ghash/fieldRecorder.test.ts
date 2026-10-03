import { i18nRef, INITIAL_STEP_INDEX, narrationFromState, validateFieldFacet, type FieldTerm } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { GF128_FIELD_NOTATION } from '../_lib/fieldNotation.ts';
import { FieldPairedRecorder, type FieldContent } from './fieldRecorder.ts';

type Region = 'a';
const term = (id: string, byte: number): FieldTerm => ({ id, label: i18nRef(`t.${id}`), bytes: [byte, ...new Array<number>(15).fill(0)], role: 'operand' });
const content = (id: string, byte: number): FieldContent => ({ formula: i18nRef(`f.${id}`), terms: [term(id, byte)] });

function recorder() {
  return new FieldPairedRecorder<Region, { op: 'set' }>(
    [{ id: 'a', labelKey: 'r.a', elem: 'u8', shape: [1] }],
    { a: [0] },
    [{ labelKey: 's.level' }],
    { narration: i18nRef('n.initial'), field: content('initial', 1) },
  );
}

const write = (value: number) => ({ op: 'set' as const, writes: [{ region: 'a' as const, offset: 0, values: [value] }], highlights: [], narration: i18nRef('n.set', { value }) });

describe('FieldPairedRecorder', () => {
  it('declares the shared GF(2¹²⁸) notation of the primitives _lib', () => {
    expect(recorder().fieldFacet().notation).toBe(GF128_FIELD_NOTATION);
  });

  it('starts with the initial narration and a step −1 field entry', () => {
    const rec = recorder();
    expect(rec.stateFacet().initialNarration).toEqual(i18nRef('n.initial'));
    expect(rec.fieldFacet().steps).toEqual([{ step: INITIAL_STEP_INDEX, ...content('initial', 1) }]);
    expect(narrationFromState(rec.stateFacet()).entries[0]).toEqual({ step: INITIAL_STEP_INDEX, ref: i18nRef('n.initial') });
  });

  it('pairs a field step with the state step at the same index, and allows steps without one', () => {
    const rec = recorder();
    expect(rec.step(write(1))).toBe(0);
    expect(rec.step(write(2), content('second', 2))).toBe(1);
    expect(rec.fieldFacet().steps.map((step) => step.step)).toEqual([INITIAL_STEP_INDEX, 1]);
    expect(validateFieldFacet(rec.fieldFacet())).toEqual([]);
  });

  it('scopedStep records in a child scope (given index or next sibling) and leaves it again', () => {
    const rec = recorder();
    rec.enter(3);
    rec.scopedStep(write(1));
    rec.scopedStep(write(2), undefined, 7);
    rec.leave();
    rec.step(write(3));
    expect(rec.stateFacet().steps.map((step) => step.scope)).toEqual([[3, 0], [3, 7], []]);
  });

  it('declares its scope levels and the GCM notation', () => {
    const rec = recorder();
    expect(rec.stateFacet().scopeLevels).toEqual([{ labelKey: 's.level' }]);
    expect(rec.fieldFacet().notation).toEqual({ field: 'gf2^128', modulus: 'x^128+x^7+x^2+x+1', bitOrder: 'gcm-reflected' });
  });
});
