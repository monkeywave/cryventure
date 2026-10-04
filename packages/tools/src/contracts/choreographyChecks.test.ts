import { RecordingTracer, type ChoreographyModule, type RegionSpec, type StepChoreography } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { choreographyProblems, choreographyTargetProblems, derivationProblems, endStateProblems, stepChoreographyProblems, stepContexts } from './choreographyChecks.ts';

const regions: RegionSpec<'s'>[] = [{ id: 's', labelKey: 'plugin.x.region.s', elem: 'u8', shape: [2] }];
const catalogs = { en: { 'plugin.x.beat': 'Beat {{n}}' }, de: { 'plugin.x.beat': 'Takt {{n}}' } };

function valid(): StepChoreography {
  return {
    duration: 1,
    tracks: [{ target: { region: 's', index: 1 }, prop: 'dx', keyframes: [{ at: 0, value: 0 }, { at: 0.5, value: -1 }, { at: 0.5, value: 0 }] }],
    beats: [{ at: 0, narration: { key: 'plugin.x.beat', params: { n: 1 } }, focus: { region: 's', indices: [0, 1] } }],
  };
}

function facet() {
  const tracer = new RecordingTracer<'s', { op: 'w' }>(regions, { s: [0, 0] });
  tracer.step({ op: 'w', writes: [{ region: 's', offset: 0, values: [7] }], highlights: [], narration: { key: 'plugin.x.beat', params: { n: 1 } } });
  tracer.step({ op: 'w', writes: [{ region: 's', offset: 1, values: [9] }], highlights: [], narration: { key: 'plugin.x.beat', params: { n: 2 } } });
  return tracer.toFacet();
}

describe('stepContexts', () => {
  it('pairs each step with the snapshots before and after it', () => {
    expect(stepContexts(facet()).map((context) => [context.before['s'], context.after['s']])).toEqual([
      [[0, 0], [7, 0]],
      [[7, 0], [7, 9]],
    ]);
  });
});

describe('choreographyProblems', () => {
  it('passes a valid choreography (duplicate `at` = snap is allowed)', () => expect(choreographyProblems(valid(), regions, catalogs)).toEqual([]));

  it('flags unknown regions, out-of-range indices, bad keyframes and bad focus', () => {
    const bad = valid();
    bad.tracks.push({ target: { region: 'q', index: 0 }, prop: 'scale', keyframes: [{ at: 0, value: 1 }] });
    bad.tracks.push({ target: { region: 's', index: 2 }, prop: 'emphasis', keyframes: [{ at: 0.6, value: 0 }, { at: 0.2, value: 0 }] });
    bad.tracks.push({ target: { region: 's', index: 0 }, prop: 'opacity', keyframes: [{ at: 1.5, value: 1 }] });
    bad.tracks.push({ target: { region: 's', index: 0 }, prop: 'dy', keyframes: [] });
    bad.beats.push({ at: 0.5, focus: { region: 's', indices: [5] } });
    expect(choreographyTargetProblems(bad, regions)).toEqual([
      'track q:0/scale unknown region "q"',
      'track s:2/emphasis index 2 outside "s" (size 2)',
      'track s:2/emphasis has unsorted keyframes',
      'track s:0/opacity has keyframes outside [0, 1]',
      'track s:0/dy has no keyframes',
      'beat focus index 5 outside "s" (size 2)',
    ]);
  });

  it('flags props that are not neutral at progress 1', () => {
    const drifting = valid();
    drifting.tracks.push({ target: { region: 's', index: 0 }, prop: 'value', keyframes: [{ at: 0, value: 0 }] });
    drifting.tracks.push({ target: { region: 's', index: 0 }, prop: 'scale', keyframes: [{ at: 0.9, value: 1.2 }] });
    expect(endStateProblems(drifting)).toEqual(['s:0.value ends at 0 (expected 1)', 's:0.scale ends at 1.2 (expected 1)']);
  });

  it('flags missing beat narration, param mismatches and non-positive durations', () => {
    const noisy = { ...valid(), duration: 0 };
    noisy.beats.push({ at: 0.2, narration: { key: 'plugin.x.missing' } }, { at: 0.3, narration: { key: 'plugin.x.beat' } });
    expect(choreographyProblems(noisy, regions, catalogs)).toEqual([
      'duration 0 is not positive',
      'en:plugin.x.missing missing',
      'en:plugin.x.beat params [] vs template [n]',
      'de:plugin.x.missing missing',
      'de:plugin.x.beat params [] vs template [n]',
    ]);
  });
});

describe('stepChoreographyProblems', () => {
  it('accepts undefined (fallback) and prefixes problems with the step', () => {
    const module: ChoreographyModule = { choreograph: (context) => (context.after['s']?.[1] === 9 ? { ...valid(), duration: -1 } : undefined) };
    expect(stepChoreographyProblems(module, facet(), catalogs)).toEqual(['step 1 (w): duration -1 is not positive']);
  });
});

describe('derivationProblems', () => {
  const node = (id: string, inputs: string[]) => ({ id, label: { key: 'k' }, bytes: [], op: 'xor', inputs });

  it('passes ordered DAGs and reports the first ordering error', () => {
    expect(derivationProblems({ kind: 'derivation', schemaVersion: 1, nodes: [node('a', []), node('b', ['a'])] })).toEqual([]);
    expect(derivationProblems({ kind: 'derivation', schemaVersion: 1, nodes: [node('b', ['a']), node('a', [])] })).toEqual(['derivation: "b" uses "a" before it is defined']);
  });

  it('reports schema problems such as a malformed lab zoom', () => {
    const zoomed = { ...node('a', []), zoom: { producerId: 'Not Kebab', params: {} } };
    expect(derivationProblems({ kind: 'derivation', schemaVersion: 1, nodes: [zoomed] })).toEqual(['derivation: node "a": zoom.producerId Not Kebab is not a kebab-case producer id']);
  });

  it('reports node fields core\'s validator lets through: NaN/fractional steps, non-byte bytes, a non-string op or id, non-integer groups', () => {
    const bad = { id: 'a', label: { key: 'k' }, bytes: [999, Number.NaN, 1.5, -1], op: 3, inputs: [], step: Number.NaN, group: 0.5 };
    const anonymous = { label: { key: 'k' }, bytes: [], op: 'xor', inputs: [], step: -2 };
    expect(derivationProblems({ kind: 'derivation', schemaVersion: 1, nodes: [bad, anonymous] as never })).toEqual([
      'derivation: node "a": bytes[0] 999 is not a byte',
      'derivation: node "a": bytes[1] NaN is not a byte',
      'derivation: node "a": bytes[2] 1.5 is not a byte',
      'derivation: node "a": bytes[3] -1 is not a byte',
      'derivation: node "a": op 3 is not a string',
      'derivation: node "a": step NaN is not an integer ≥ -1',
      'derivation: node "a": group 0.5 is not an integer',
      'derivation: node 1: id undefined is not a non-empty string',
      'derivation: node 1: step -2 is not an integer ≥ -1',
    ]);
  });

  it('reports dangling inputs (ids no node defines) and non-string inputs', () => {
    expect(derivationProblems({ kind: 'derivation', schemaVersion: 1, nodes: [node('a', ['missing'])] })).toEqual(['derivation: "a" uses "missing" before it is defined']);
    expect(derivationProblems({ kind: 'derivation', schemaVersion: 1, nodes: [node('a', [7 as never])] })).toEqual(['derivation: node "a": inputs[0] 7 is not a string']);
  });
});
