import { bytesEqual, getFacet, hashFunction, paramFieldsOf, toHex, type HashFamily, type PrimitiveManifest, type TraceBundle, type ValuesFacet } from '@cryventure/core';

/**
 * Cross-check of a `Hash` producer's traced `run()` against its own untraced port (docs/M5.md §1):
 * for every case whose `algorithm` is a function id of the family, `hash(message)` must equal
 * `run(params).output.digest`, so a port cannot drift from what the lessons show.
 *
 * The message is the one the run itself publishes: the bytes of its `values` facet's `message`
 * value. Empty values are omitted (SHA-2 publishes no `message` for the empty message), so a case
 * without one hashes the empty message — unless no case publishes a `message` at all, in which
 * case the producer does not expose its message and the check is skipped.
 */

export type HashRunManifest = Pick<PrimitiveManifest, 'implements' | 'outputs' | 'paramFields' | 'defaults' | 'i18nNamespace'>;

export interface HashRunCase {
  name: string;
  params: unknown;
  /** `run(params).output`. */
  output: Record<string, number[]>;
  /** The run's published `message` value bytes (`publishedMessage`); undefined when it publishes none. */
  message?: readonly number[];
}

const ALGORITHM_PARAM = 'algorithm';
const DIGEST_OUTPUT = 'digest';
const MESSAGE_VALUE = 'message';

/** Whether the cross-check applies: implements `Hash`, declares a `digest` output and an `algorithm` select param. */
export function checksHashRuns(manifest: HashRunManifest): boolean {
  const hasAlgorithm = paramFieldsOf(manifest).some((field) => field.name === ALGORITHM_PARAM && field.kind === 'select');
  return manifest.implements.includes('Hash') && manifest.outputs?.[DIGEST_OUTPUT] !== undefined && hasAlgorithm;
}

/** The bytes of the bundle's `message` value, or undefined when it publishes none. */
export function publishedMessage(bundle: TraceBundle): number[] | undefined {
  return getFacet<ValuesFacet>(bundle, 'values')?.values.find((value) => value.id === MESSAGE_VALUE)?.bytes;
}

function algorithmOf(params: unknown): unknown {
  return typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[ALGORITHM_PARAM] : undefined;
}

function caseProblems(family: HashFamily, testCase: HashRunCase): string[] {
  const algorithm = algorithmOf(testCase.params);
  const fn = typeof algorithm === 'string' ? hashFunction(family, algorithm) : undefined;
  if (fn === undefined) return [];
  const digest = testCase.output[DIGEST_OUTPUT];
  if (digest === undefined) return [`run has no "${DIGEST_OUTPUT}" output`];
  const expected = fn.hash(Uint8Array.from(testCase.message ?? []));
  return bytesEqual(expected, digest) ? [] : [`run digest ${toHex(digest)}, but Hash port "${fn.id}" gives ${toHex(expected)}`];
}

/**
 * Cases whose run digest differs from the family's function over the published message; other
 * algorithms are skipped, and so is everything when no case publishes a `message` value.
 */
export function hashRunProblems(family: HashFamily, cases: readonly HashRunCase[]): string[] {
  if (cases.every((testCase) => testCase.message === undefined)) return [];
  return cases.flatMap((testCase) => caseProblems(family, testCase).map((problem) => `${testCase.name}: ${problem}`));
}
