import type { AnyStateFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { locateAesOps } from './aesTrace.ts';
import { aesFixtureBundle } from './fixtures/aesBundles.ts';
import { INITIAL_SPAN, instructionSpan, nextFrom, pointSpan } from './isaSpans.ts';

const ops = locateAesOps(aesFixtureBundle('fips197-c1').facets['state@default'] as AnyStateFacet);

describe('pointSpan', () => {
  it('is zero-width', () => {
    expect(pointSpan(7)).toEqual({ first: 7, last: 7 });
  });
});

describe('instructionSpan', () => {
  const atStart = { previous: INITIAL_SPAN, nextAesFirst: 2 };

  it('spans from the first to the last covered op', () => {
    const covers = [
      { op: 'subBytes', round: 1 },
      { op: 'shiftRows', round: 1 },
      { op: 'mixColumns', round: 1 },
      { op: 'addRoundKey', round: 1 },
    ] as const;
    expect(instructionSpan('round', covers, ops, atStart)).toEqual({ first: 3, last: 6 });
  });

  it('puts loadState on input and store on output', () => {
    expect(instructionSpan('loadState', [], ops, atStart)).toEqual({ first: 0, last: 0 });
    expect(
      instructionSpan('store', [], ops, {
        previous: { first: 39, last: 41 },
        nextAesFirst: undefined,
      }),
    ).toEqual({ first: 42, last: 42 });
  });

  it('puts other instructions on the next AES instruction, so they never shadow the previous one', () => {
    expect(
      instructionSpan('loadKey', [], ops, { previous: { first: 3, last: 6 }, nextAesFirst: 7 }),
    ).toEqual({ first: 7, last: 7 });
  });

  it('keeps instructions before the state load on the initial state', () => {
    expect(instructionSpan('loadKey', [], ops, atStart)).toEqual(INITIAL_SPAN);
  });

  it('puts instructions after the last AES instruction on the output step', () => {
    expect(
      instructionSpan('other', [], ops, {
        previous: { first: 39, last: 41 },
        nextAesFirst: undefined,
      }),
    ).toEqual({ first: 42, last: 42 });
  });
});

describe('nextFrom', () => {
  it('gives each item the value of the nearest later item that has one', () => {
    const items = [1, 0, 3, 0, 5, 0];
    const odd = (item: number) => (item % 2 === 1 ? item * 10 : undefined);
    expect(nextFrom(items, odd)).toEqual([30, 30, 50, 50, undefined, undefined]);
    expect(nextFrom([], odd)).toEqual([]);
  });
});
