import { toHex, type TraceBundle } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { sharedShaFixtureBundle, shaFixtureBundle } from './fixtures/shaBundles.ts';
import {
  chainingValueId,
  regionWord,
  roundStep,
  scheduleStep,
  shaTrace,
  termWord,
} from './shaTrace.ts';

type MutableState = { regions: { id: string }[]; steps: { op: string }[] };
type MutableWordops = {
  steps: { step: number; terms: { id: string; hex: string }[]; registers?: { after: string[] } }[];
};

/** The wordops entry of state step `step` in a (mutable) fixture bundle. */
function wordopsEntry(bundle: TraceBundle, step: number): MutableWordops['steps'][number] {
  const wordops = bundle.facets['wordops@default'] as MutableWordops;
  return wordops.steps.find((entry) => entry.step === step)!;
}

function withoutFacet(bundle: TraceBundle, key: string): TraceBundle {
  const facets = { ...bundle.facets };
  delete facets[key as keyof typeof facets];
  return { ...bundle, facets };
}

describe('shaTrace', () => {
  it('locates init, schedule, rounds and feed-forward of the one "abc" block, then output', () => {
    const trace = shaTrace(sharedShaFixtureBundle('sha-256-abc'));
    const [block] = trace.blocks;
    expect(trace.blocks).toHaveLength(1);
    expect(block!.init).toBe(1);
    expect(roundStep(block!, 0)).toBe(2);
    // FIPS order at round detail: round 15, schedule 16, round 16 (docs/M5.md §2c).
    expect(scheduleStep(block!, 16)).toBe(roundStep(block!, 15) + 1);
    expect(roundStep(block!, 16)).toBe(scheduleStep(block!, 16) + 1);
    expect(block!.feedForward).toBe(roundStep(block!, 63) + 1);
    expect(trace.output).toBe(block!.feedForward + 1);
    expect(trace.facet.steps).toHaveLength(trace.output + 1);
  });

  it('finds both blocks of the two-block message, each with its own init and feed-forward', () => {
    const trace = shaTrace(sharedShaFixtureBundle('sha-256-two-block'));
    expect(trace.blocks.map((block) => block.index)).toEqual([0, 1]);
    expect(trace.blocks[1]!.init).toBe(trace.blocks[0]!.feedForward + 1);
    expect(trace.output).toBe(trace.blocks[1]!.feedForward + 1);
  });

  it('reads words of a region and wordops terms as big-endian bytes', () => {
    const trace = shaTrace(sharedShaFixtureBundle('sha-256-abc'));
    const block = trace.blocks[0]!;
    expect(toHex(regionWord(trace, 'vars', roundStep(block, 0), 0))).toBe('5d6aebcd');
    expect(toHex(termWord(trace, roundStep(block, 0), 'k'))).toBe('428a2f98');
    expect(toHex(termWord(trace, roundStep(block, 0), 'kw'))).toBe('a3ec9318');
    expect(() => termWord(trace, roundStep(block, 0), 'p1')).toThrow(/no wordops term "p1"/);
    expect(() => regionWord(trace, 'vars', block.init, 8)).toThrow(/no word 8/);
  });

  it('names the chaining values iv, h/1, … and throws for one the values facet lacks', () => {
    const trace = shaTrace(sharedShaFixtureBundle('sha-256-abc'));
    expect([chainingValueId(trace, 0), chainingValueId(trace, 1)]).toEqual(['iv', 'h/1']);
    expect(() => chainingValueId(trace, 2)).toThrow(/no value "h\/2"/);
    expect(() => roundStep(trace.blocks[0]!, 64)).toThrow(/no round 64/);
    expect(() => scheduleStep(trace.blocks[0]!, 15)).toThrow(/no schedule 15/);
  });

  it('memoises per bundle, also on the shared (deep-frozen, uncopied) fixture bundle', () => {
    const bundle = shaFixtureBundle('sha-256-abc');
    expect(shaTrace(bundle)).toBe(shaTrace(bundle));
    const shared = sharedShaFixtureBundle('sha-256-abc');
    expect(sharedShaFixtureBundle('sha-256-abc')).toBe(shared);
    expect(Object.isFrozen(shared.facets['state@default'])).toBe(true);
    expect(shaTrace(shared)).toBe(shaTrace(sharedShaFixtureBundle('sha-256-abc')));
  });

  it('throws on a broken contract: missing facets, regions, round-detail blocks or output', () => {
    const bundle = shaFixtureBundle('sha-256-abc');
    expect(() => shaTrace(withoutFacet(bundle, 'wordops@default'))).toThrow(/no wordops facet/);
    expect(() => shaTrace(withoutFacet(bundle, 'state@default'))).toThrow(/no state facet/);
    const renamed = shaFixtureBundle('sha-256-abc');
    (renamed.facets['state@default'] as MutableState).regions[3]!.id = 'working';
    expect(() => shaTrace(renamed)).toThrow(/no "vars" region/);
    const short = shaFixtureBundle('sha-256-abc');
    (short.facets['state@default'] as MutableState).steps[2]!.op = 'compress';
    expect(() => shaTrace(short)).toThrow(/63 round steps/);
    const noOutput = shaFixtureBundle('sha-256-abc');
    (noOutput.facets['state@default'] as MutableState).steps.at(-1)!.op = 'done';
    expect(() => shaTrace(noOutput)).toThrow(/no output step/);
  });

  it('throws when the wordops W term of a round disagrees with word t of the "w" region', () => {
    const tampered = shaFixtureBundle('sha-256-two-block');
    const step = roundStep(shaTrace(sharedShaFixtureBundle('sha-256-two-block')).blocks[1]!, 20);
    wordopsEntry(tampered, step).terms.find((term) => term.id === 'w')!.hex = 'deadbeef';
    expect(() => shaTrace(tampered)).toThrow(
      /block 1 round 20: wordops w deadbeef ≠ state W_20 00000000/,
    );
  });

  it('throws when the wordops registers.after of a round disagree with the "vars" region', () => {
    const tampered = shaFixtureBundle('sha-256-abc');
    const step = roundStep(shaTrace(sharedShaFixtureBundle('sha-256-abc')).blocks[0]!, 5);
    wordopsEntry(tampered, step).registers!.after[6] = 'deadbeef';
    expect(() => shaTrace(tampered)).toThrow(/block 0 round 5: wordops g deadbeef ≠ state g/);
    const missing = shaFixtureBundle('sha-256-abc');
    delete wordopsEntry(missing, step).registers;
    expect(() => shaTrace(missing)).toThrow(/block 0 round 5: no wordops registers/);
  });
});
