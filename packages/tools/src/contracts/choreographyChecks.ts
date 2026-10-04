import {
  assertTopologicalOrder,
  INITIAL_STEP_INDEX,
  NEUTRAL_NODE_PROPS,
  regionSize,
  sampleChoreography,
  stepContexts,
  type AnyStateFacet,
  type ChoreographyModule,
  type DerivationFacet,
  type NodeRef,
  type RegionSpec,
  type StepChoreography,
  type Track,
  type TrackProp,
  validateDerivationFacet,
} from '@cryventure/core';
import type { LocaleCatalogs } from './catalogs.ts';
import { refProblems } from './checks.ts';

/** Pure checks for producer choreographies and derivation facets (empty list = pass). */

/** Before/after snapshots and the step, for every step of a state facet (re-exported from core). */
export { stepContexts } from '@cryventure/core';

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

const isByte = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xff;
const isStepIndex = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= INITIAL_STEP_INDEX;

/**
 * Node fields core's `validateDerivationFacet` (frozen in M7) does not check: a non-empty string `id`,
 * a string `op`, `bytes` of bytes, string `inputs`, an integer `step` ≥ −1 and an integer `group`.
 */
function derivationNodeFieldProblems(node: DerivationFacet['nodes'][number], index: number): string[] {
  const where = typeof node.id === 'string' ? `derivation: node "${node.id}"` : `derivation: node ${index}`;
  const { id, op, bytes, inputs, step, group } = node as { [K in keyof typeof node]: unknown };
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  return [
    ...(typeof id === 'string' && id !== '' ? [] : [`${where}: id ${String(id)} is not a non-empty string`]),
    ...(Array.isArray(bytes) ? list(bytes).flatMap((byte, i) => (isByte(byte) ? [] : [`${where}: bytes[${i}] ${String(byte)} is not a byte`])) : [`${where}: bytes is not an array`]),
    ...(typeof op === 'string' ? [] : [`${where}: op ${String(op)} is not a string`]),
    ...(Array.isArray(inputs) ? list(inputs).flatMap((input, i) => (typeof input === 'string' ? [] : [`${where}: inputs[${i}] ${String(input)} is not a string`])) : [`${where}: inputs is not an array`]),
    ...(step === undefined || isStepIndex(step) ? [] : [`${where}: step ${String(step)} is not an integer ≥ ${INITIAL_STEP_INDEX}`]),
    ...(group === undefined || Number.isInteger(group) ? [] : [`${where}: group ${String(group)} is not an integer`]),
  ];
}

/**
 * Core's `validateDerivationFacet`, then the node fields it leaves unchecked (docs/M7.md §1e: no
 * NaN/±Infinity in numeric fields), then `assertTopologicalOrder` (which also rejects dangling inputs).
 */
export function derivationProblems(facet: DerivationFacet): string[] {
  const schema = validateDerivationFacet(facet);
  if (schema.length > 0) return schema;
  const fields = facet.nodes.flatMap(derivationNodeFieldProblems);
  if (fields.length > 0) return fields;
  try {
    assertTopologicalOrder(facet);
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}
