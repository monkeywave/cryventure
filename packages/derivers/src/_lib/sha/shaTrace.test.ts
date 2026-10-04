import { toHex, type TraceBundle } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { shaFixtureBundle } from './fixtures/shaBundles.ts';
import {
  chainingValueId,
  regionWord,
  roundStep,
  scheduleStep,
  shaTrace,
  termWord,
} from './shaTrace.ts';

type MutableState = { regions: { id: string }[]; steps: { op: string }[] };

function withoutFacet(bundle: TraceBundle, key: string): TraceBundle {
  const facets = { ...bundle.facets };
  delete facets[key as keyof typeof facets];
  return { ...bundle, facets };
}

describe('shaTrace', () => {
  it('locates init, schedule, rounds and feed-forward of the one "abc" block, then output', () => {
    const trace = shaTrace(shaFixtureBundle('sha-256-abc'));
    const [block] = trace.blocks;
    expect(trace.blocks).toHaveLength(1);
    expect(block!.init).toBe(1);
    expect(roundStep(block!, 0)).toBe(2);
    // FIPS order at round detail: round 15, schedule 16, round 16 (docs/M5.md §2c).
    expect(scheduleStep(block!, 16)).toBe(roundStep(block!, 15) + 1);
    expect(roundStep(block!, 16)).toBe(scheduleStep(block!, 16) + 1);
    expect(block!.feedForward).toBe(roundStep(block!, 63) + 1);
    expect(trace.output).toBe(block!.feedForward + 1);
    expect(trace.stepCount).toBe(trace.output + 1);
  });

  it('finds both blocks of the two-block message, each with its own init and feed-forward', () => {
    const trace = shaTrace(shaFixtureBundle('sha-256-two-block'));
    expect(trace.blocks.map((block) => block.index)).toEqual([0, 1]);
    expect(trace.blocks[1]!.init).toBe(trace.blocks[0]!.feedForward + 1);
    expect(trace.output).toBe(trace.blocks[1]!.feedForward + 1);
  });

  it('reads words of a region and wordops terms as big-endian bytes', () => {
    const trace = shaTrace(shaFixtureBundle('sha-256-abc'));
    const block = trace.blocks[0]!;
    expect(toHex(regionWord(trace, 'vars', roundStep(block, 0), 0))).toBe('5d6aebcd');
    expect(toHex(termWord(trace, roundStep(block, 0), 'k'))).toBe('428a2f98');
    expect(toHex(termWord(trace, roundStep(block, 0), 'kw'))).toBe('a3ec9318');
    expect(() => termWord(trace, roundStep(block, 0), 'p1')).toThrow(/no wordops term "p1"/);
    expect(() => regionWord(trace, 'vars', block.init, 8)).toThrow(/no word 8/);
  });

  it('names the chaining values iv, h/1, … and throws for one the values facet lacks', () => {
    const trace = shaTrace(shaFixtureBundle('sha-256-abc'));
    expect([chainingValueId(trace, 0), chainingValueId(trace, 1)]).toEqual(['iv', 'h/1']);
    expect(() => chainingValueId(trace, 2)).toThrow(/no value "h\/2"/);
    expect(() => roundStep(trace.blocks[0]!, 64)).toThrow(/no round 64/);
    expect(() => scheduleStep(trace.blocks[0]!, 15)).toThrow(/no schedule 15/);
  });

  it('memoises per bundle', () => {
    const bundle = shaFixtureBundle('sha-256-abc');
    expect(shaTrace(bundle)).toBe(shaTrace(bundle));
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
});
