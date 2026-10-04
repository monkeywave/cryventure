import { bytesEqual, getFacet, hashFunction, toHex, utf8Bytes, xofFunction, type HashFamily, type PrimitiveManifest, type TraceBundle, type ValuesFacet } from '@cryventure/core';

/**
 * Cross-check of a `Hash` producer's traced `run()` against its own untraced port (docs/M5.md §1):
 * for every case whose `algorithm` is a function id of the family (or, without an `algorithm`
 * param, when the family has exactly one function, e.g. md5, sha1), `hash(message)` must equal
 * `run(params).output.digest`, so a port cannot drift from what the lessons show. A case whose
 * `algorithm` is one of the family's XOFs compares with `xof(message, outputLength, { functionName,
 * customization })` instead (the strings UTF-8; `outputLength` defaults to the run's length).
 *
 * Cases with a non-empty `key` param are skipped: a keyed hash (e.g. BLAKE2 with a key) is a MAC,
 * whose output the unkeyed port function cannot reproduce.
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
const KEY_PARAM = 'key';
const OUTPUT_LENGTH_PARAM = 'outputLength';
const DIGEST_OUTPUT = 'digest';
const MESSAGE_VALUE = 'message';

/** Whether the cross-check applies: implements `Hash` and declares a `digest` output. */
export function checksHashRuns(manifest: HashRunManifest): boolean {
  return manifest.implements.includes('Hash') && manifest.outputs?.[DIGEST_OUTPUT] !== undefined;
}

/** The bytes of the bundle's `message` value, or undefined when it publishes none. */
export function publishedMessage(bundle: TraceBundle): number[] | undefined {
  return getFacet<ValuesFacet>(bundle, 'values')?.values.find((value) => value.id === MESSAGE_VALUE)?.bytes;
}

function paramOf(params: unknown, name: string): unknown {
  return typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[name] : undefined;
}

const textParam = (params: unknown, name: string): string => {
  const value = paramOf(params, name);
  return typeof value === 'string' ? value : '';
};

/** What the port computes for a case's message (`label` names the port function), or undefined to skip the case. */
type PortOutput = { label: string; compute: (message: Uint8Array, runLength: number) => Uint8Array };

const hashOutput = (fn: HashFamily['functions'][number]): PortOutput => ({ label: `"${fn.id}"`, compute: (message) => fn.hash(message) });

function portOutputFor(family: HashFamily, params: unknown): PortOutput | undefined {
  if (textParam(params, KEY_PARAM) !== '') return undefined;
  const algorithm = paramOf(params, ALGORITHM_PARAM);
  if (algorithm === undefined) return family.functions.length === 1 ? hashOutput(family.functions[0]!) : undefined;
  if (typeof algorithm !== 'string') return undefined;
  const fn = hashFunction(family, algorithm);
  if (fn !== undefined) return hashOutput(fn);
  const xof = xofFunction(family, algorithm);
  if (xof === undefined) return undefined;
  const custom = { functionName: utf8Bytes(textParam(params, 'functionName')), customization: utf8Bytes(textParam(params, 'customization')) };
  const length = Number(paramOf(params, OUTPUT_LENGTH_PARAM));
  return { label: `XOF "${xof.id}"`, compute: (message, runLength) => xof.xof(message, Number.isInteger(length) && length > 0 ? length : runLength, custom) };
}

function caseProblems(family: HashFamily, testCase: HashRunCase): string[] {
  const port = portOutputFor(family, testCase.params);
  if (port === undefined) return [];
  const digest = testCase.output[DIGEST_OUTPUT];
  if (digest === undefined) return [`run has no "${DIGEST_OUTPUT}" output`];
  const expected = port.compute(Uint8Array.from(testCase.message ?? []), digest.length);
  return bytesEqual(expected, digest) ? [] : [`run digest ${toHex(digest)}, but Hash port ${port.label} gives ${toHex(expected)}`];
}

/**
 * Cases whose run digest differs from the family's function (or XOF) over the published message;
 * other algorithms and keyed cases are skipped, and so is everything when no case publishes a `message` value.
 */
export function hashRunProblems(family: HashFamily, cases: readonly HashRunCase[]): string[] {
  if (cases.every((testCase) => testCase.message === undefined)) return [];
  return cases.flatMap((testCase) => caseProblems(family, testCase).map((problem) => `${testCase.name}: ${problem}`));
}
