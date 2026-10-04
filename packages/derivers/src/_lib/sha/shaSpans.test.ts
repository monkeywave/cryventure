import { describe, expect, it } from 'vitest';
import { INITIAL_SPAN } from '../isaSpans.ts';
import type { ShaListingInstruction, ShaListingRole } from '../listing.ts';
import {
  blockSpans,
  isRoundInstruction,
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
    expect(blockSpans(listing, timeline(2), INITIAL_SPAN)).toEqual([
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
    expect(blockSpans(listing, timeline(4), INITIAL_SPAN)).toEqual([
      { first: 10, last: 13 },
      { first: 10, last: 13 },
      { first: 10, last: 13 },
      point(90),
    ]);
  });

  it('never goes back behind the previous block', () => {
    const spans = blockSpans([listed('loadState'), listed('rounds', 0)], timeline(2), point(5));
    expect(spans).toEqual([point(5), { first: 10, last: 11 }]);
  });

  it('throws for a listing without round instructions or a round instruction without a round', () => {
    expect(() => blockSpans([listed('loadState')], timeline(2), INITIAL_SPAN)).toThrow(
      /no round instruction/,
    );
    expect(() => blockSpans([listed('rounds')], timeline(2), INITIAL_SPAN)).toThrow(/no round/);
    expect(() => requiredShaRound(listed('rounds2'))).toThrow(/rounds2: no round/);
    expect([listed('rounds'), listed('rounds2'), listed('msg2')].map(isRoundInstruction)).toEqual([
      true,
      true,
      false,
    ]);
  });
});
