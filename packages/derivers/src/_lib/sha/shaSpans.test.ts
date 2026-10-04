import type { AlignSpan } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { INITIAL_SPAN } from '../isaSpans.ts';
import type { ShaListingInstruction, ShaListingRole } from '../listing.ts';
import {
  blockSpans,
  isRoundInstruction,
  listingShape,
  nextRoundStarts,
  requiredShaRound,
  type ShaBlockTimeline,
} from './shaSpans.ts';

const listed = (role: ShaListingRole, round?: number): ShaListingInstruction => ({
  address: '0x0',
  mnemonic: role,
  operands: [],
  role,
  ...(round === undefined ? {} : { round }),
});

/** A fake block: init on step 1, round t on step 10 + t, feed-forward on 80, stores on 90. */
const timeline = (roundsPerInstruction: number): ShaBlockTimeline => ({
  block: {
    index: 0,
    init: 1,
    rounds: Array.from({ length: 64 }, (_, t) => 10 + t),
    schedule: [],
    feedForward: 80,
  },
  storeStep: 90,
  roundsPerInstruction,
});

/** `blockSpans` with the listing's shape computed as the walker does, once per listing. */
const spansOf = (
  listing: ShaListingInstruction[],
  block: ShaBlockTimeline,
  previous: AlignSpan,
): AlignSpan[] => blockSpans(listing, listingShape(listing), block, previous);

const point = (step: number) => ({ first: step, last: step });

describe('blockSpans (docs/M5.md §5c)', () => {
  it('puts setup on init, round instructions on their rounds, the rest on the next round instruction, finishing on feed-forward/output', () => {
    const listing = [
      listed('loadState'),
      listed('other'),
      listed('packState'),
      listed('addK'),
      listed('other'),
      listed('rounds', 0),
      listed('addK'),
      listed('unpackState'),
      listed('rounds', 2),
      listed('byteSwap'),
      listed('msg1'),
      listed('rounds', 4),
      listed('feedForward'),
      listed('other'),
      listed('store'),
      listed('other'),
    ];
    expect(spansOf(listing, timeline(2), INITIAL_SPAN)).toEqual([
      point(1),
      point(1),
      point(1),
      point(10),
      point(10),
      { first: 10, last: 11 },
      point(12),
      point(12),
      { first: 12, last: 13 },
      point(14),
      point(14),
      { first: 14, last: 15 },
      point(80),
      point(90),
      point(90),
      point(90),
    ]);
  });

  it('keeps spans monotonic: a copy between two round instructions over the same rounds takes the span before it', () => {
    const listing = [listed('rounds', 0), listed('other'), listed('rounds2', 0), listed('store')];
    expect(spansOf(listing, timeline(4), INITIAL_SPAN)).toEqual([
      { first: 10, last: 13 },
      { first: 10, last: 13 },
      { first: 10, last: 13 },
      point(90),
    ]);
  });

  it('never goes back behind the previous block', () => {
    const spans = spansOf([listed('loadState'), listed('rounds', 0)], timeline(2), point(5));
    expect(spans).toEqual([point(5), { first: 10, last: 11 }]);
  });

  it('throws for a round instruction that starts before the running span (a reordered listing)', () => {
    const reordered = [listed('rounds', 4), listed('addK'), listed('rounds', 0)];
    expect(() => spansOf(reordered, timeline(2), INITIAL_SPAN)).toThrow(
      'listing 0x0 rounds: rounds 0 … 1 (steps 10 … 11) start before the span before it (steps 14 … 15)',
    );
    expect(() => spansOf([listed('rounds', 0)], timeline(2), point(12))).toThrow(
      /start before the span before it \(steps 12 … 12\)/,
    );
  });

  it('throws for a listing without round instructions or a round instruction without a round', () => {
    expect(() => spansOf([listed('loadState')], timeline(2), INITIAL_SPAN)).toThrow(
      /no round instruction/,
    );
    expect(() => spansOf([listed('rounds')], timeline(2), INITIAL_SPAN)).toThrow(/no round/);
    expect(() => requiredShaRound(listed('rounds2'))).toThrow(/rounds2: no round/);
    expect([listed('rounds'), listed('rounds2'), listed('msg2')].map(isRoundInstruction)).toEqual([
      true,
      true,
      false,
    ]);
  });
});

describe('nextRoundStarts', () => {
  it('gives each instruction the first round of the next round instruction, none after the last', () => {
    const listing = [
      listed('loadState'),
      listed('rounds', 0),
      listed('addK'),
      listed('msg1'),
      listed('rounds2', 4),
      listed('store'),
    ];
    expect(nextRoundStarts(listing)).toEqual([0, 4, 4, 4, undefined, undefined]);
  });
});

describe('listingShape', () => {
  it('locates the first and last round instruction and the next round per instruction', () => {
    const listing = [
      listed('loadState'),
      listed('rounds', 0),
      listed('msg1'),
      listed('rounds2', 4),
    ];
    expect(listingShape(listing)).toEqual({
      isRound: [false, true, false, true],
      firstRound: 1,
      lastRound: 3,
      nextRound: [0, 4, 4, undefined],
    });
  });
});
