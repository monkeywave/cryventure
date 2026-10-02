import {
  assertTopologicalOrder,
  NEUTRAL_NODE_PROPS,
  regionSize,
  sampleChoreography,
  stateAt,
  type ChoreographyContext,
  type ChoreographyModule,
  type DerivationFacet,
  type NodeRef,
  type RegionSpec,
  type StepChoreography,
  type Track,
  type TrackProp,
} from '@cryventure/core';
import type { LocaleCatalogs } from './catalogs.ts';
import { refProblems, type AnyStateFacet } from './checks.ts';

/** Pure checks for producer choreographies and derivation facets (empty list = pass). */

/** Before/after snapshots and the step, for every step of a state facet. */
export function stepContexts(facet: AnyStateFacet): ChoreographyContext[] {
  return facet.steps.map((step, index) => ({ before: stateAt(facet, index - 1), after: stateAt(facet, index), step }));
}

function nodeProblem(node: NodeRef, regions: readonly RegionSpec<string>[]): string | undefined {
  const region = regions.find((candidate) => candidate.id === node.region);
  if (region === undefined) return `unknown region "${node.region}"`;
  const size = regionSize(region);
  return Number.isInteger(node.index) && node.index >= 0 && node.index < size ? undefined : `index ${node.index} outside "${node.region}" (size ${size})`;
}

function keyframeProblem(track: Track): string | undefined {
  const ats = track.keyframes.map((frame) => frame.at);
  if (ats.length === 0) return 'has no keyframes';
  if (ats.some((at) => !(at >= 0 && at <= 1))) return 'has keyframes outside [0, 1]';
  return ats.every((at, i) => i === 0 || at >= ats[i - 1]!) ? undefined : 'has unsorted keyframes';
}

/** Tracks and beat focus groups must address existing cells; keyframes must be sorted in [0, 1]. */
export function choreographyTargetProblems(choreography: StepChoreography, regions: readonly RegionSpec<string>[]): string[] {
  const trackProblems = choreography.tracks.flatMap((track) => {
    const label = `track ${track.target.region}:${track.target.index}/${track.prop}`;
    return [nodeProblem(track.target, regions), keyframeProblem(track)].filter((problem) => problem !== undefined).map((problem) => `${label} ${problem}`);
  });
  const focusProblems = choreography.beats.flatMap((beat) =>
    (beat.focus?.indices ?? []).map((index) => nodeProblem({ region: beat.focus?.region ?? '', index }, regions)).filter((problem) => problem !== undefined).map((problem) => `beat focus ${problem}`),
  );
  return [...trackProblems, ...focusProblems];
}

/** Props that are not neutral once the step has finished (progress = 1). */
export function endStateProblems(choreography: StepChoreography): string[] {
  return [...sampleChoreography(choreography, 1)].flatMap(([id, props]) =>
    Object.entries(props)
      .filter(([prop, value]) => value !== NEUTRAL_NODE_PROPS[prop as TrackProp])
      .map(([prop, value]) => `${id}.${prop} ends at ${value} (expected ${NEUTRAL_NODE_PROPS[prop as TrackProp]})`),
  );
}

/** All problems of one step's choreography, including beat narration keys/params in EN and DE. */
export function choreographyProblems(choreography: StepChoreography, regions: readonly RegionSpec<string>[], catalogs: LocaleCatalogs): string[] {
  const narration = choreography.beats.flatMap((beat) => (beat.narration === undefined ? [] : [beat.narration]));
  const duration = Number.isFinite(choreography.duration) && choreography.duration > 0 ? [] : [`duration ${choreography.duration} is not positive`];
  return [...duration, ...choreographyTargetProblems(choreography, regions), ...endStateProblems(choreography), ...refProblems(narration, catalogs)];
}

/** Runs `module.choreograph` for every step; `undefined` (fallback) is always fine. */
export function stepChoreographyProblems(module: ChoreographyModule, facet: AnyStateFacet, catalogs: LocaleCatalogs): string[] {
  return stepContexts(facet).flatMap((context, step) => {
    const choreography = module.choreograph(context);
    if (choreography === undefined) return [];
    return [...new Set(choreographyProblems(choreography, facet.regions, catalogs))].map((problem) => `step ${step} (${context.step.op}): ${problem}`);
  });
}

/** `assertTopologicalOrder` as a problem list. */
export function derivationProblems(facet: DerivationFacet): string[] {
  try {
    assertTopologicalOrder(facet);
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}
