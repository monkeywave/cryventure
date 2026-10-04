import { bytesEqual, getFacet, hashFunction, readText, toHex, utf8Bytes, xofFunction, type HashFamily, type PrimitiveManifest, type TraceBundle, type ValuesFacet } from '@cryventure/core';
import { isRecord } from './jsonValues.ts';

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
 *
 * Producers with `PrimitiveManifest.hashLabParams` are cross-checked by `hashLabProblems` instead,
 * which needs no param names; for them this check runs with `xofOnly` (XOFs have no lab hook).
 */

/** Options of `hashRunProblems`. */
export interface HashRunOptions {
  /** Check only XOF cases: the producer's fixed-length functions are cross-checked by `hashLabProblems`. */
  xofOnly?: boolean;
}

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

/** A string param's value; '' when absent or not a string. */
const textParam = (params: Readonly<Record<string, unknown>>, name: string): string => readText(params[name], Number.POSITIVE_INFINITY) ?? '';

/** What the port computes for a case's message (`label` names the port function), or undefined to skip the case. */
type PortOutput = { label: string; compute: (message: Uint8Array, runLength: number) => Uint8Array };

const hashOutput = (fn: HashFamily['functions'][number]): PortOutput => ({ label: `"${fn.id}"`, compute: (message) => fn.hash(message) });

function portOutputFor(family: HashFamily, caseParams: unknown, options: HashRunOptions): PortOutput | undefined {
  const params = isRecord(caseParams) ? caseParams : {};
  if (textParam(params, KEY_PARAM) !== '') return undefined;
  const algorithm = params[ALGORITHM_PARAM];
  if (algorithm === undefined) return family.functions.length === 1 && options.xofOnly !== true ? hashOutput(family.functions[0]!) : undefined;
  if (typeof algorithm !== 'string') return undefined;
  const fn = hashFunction(family, algorithm);
  if (fn !== undefined) return options.xofOnly === true ? undefined : hashOutput(fn);
  const xof = xofFunction(family, algorithm);
  if (xof === undefined) return undefined;
  const custom = { functionName: utf8Bytes(textParam(params, 'functionName')), customization: utf8Bytes(textParam(params, 'customization')) };
  const length = Number(params[OUTPUT_LENGTH_PARAM]);
  return { label: `XOF "${xof.id}"`, compute: (message, runLength) => xof.xof(message, Number.isInteger(length) && length > 0 ? length : runLength, custom) };
}

function caseProblems(family: HashFamily, testCase: HashRunCase, options: HashRunOptions): string[] {
  const port = portOutputFor(family, testCase.params, options);
  if (port === undefined) return [];
  const digest = testCase.output[DIGEST_OUTPUT];
  if (digest === undefined) return [`run has no "${DIGEST_OUTPUT}" output`];
  const expected = port.compute(Uint8Array.from(testCase.message ?? []), digest.length);
  return bytesEqual(expected, digest) ? [] : [`run digest ${toHex(digest)}, but Hash port ${port.label} gives ${toHex(expected)}`];
}

/**
 * Cases whose run digest differs from the family's function (or XOF) over the published message;
 * other algorithms and keyed cases are skipped (with `xofOnly`, every non-XOF case), and so is
 * everything when no case publishes a `message` value.
 */
export function hashRunProblems(family: HashFamily, cases: readonly HashRunCase[], options: HashRunOptions = {}): string[] {
  if (cases.every((testCase) => testCase.message === undefined)) return [];
  return cases.flatMap((testCase) => caseProblems(family, testCase, options).map((problem) => `${testCase.name}: ${problem}`));
}

/**
 * Message lengths the lab cross-check hashes: empty, "abc", 56 bytes (SHA-2 padding needs a second
 * block), 128 (the SHA-2/BLAKE2/MD5 limit) and 200 (the SHA-3 limit). Lengths past a lab's limit are
 * skipped (its `hashLabParams` returns `undefined`).
 */
export const HASH_LAB_MESSAGE_LENGTHS: readonly number[] = [0, 3, 56, 128, 200];

/** The fixed message of `length` bytes: "abc" for 3, else bytes `(37·i + 11) mod 256`. */
export function hashLabMessage(length: number): Uint8Array {
  return length === 3 ? utf8Bytes('abc') : Uint8Array.from({ length }, (_, i) => (37 * i + 11) & 0xff);
}

/** Validates and runs lab params: the run's output, or why it was rejected (shared by the Hash and MAC cross-checks). */
export type LabRunner = (params: Record<string, string>) => Record<string, number[]> | string;

/** The runner of a Hash producer's own lab. */
export type HashLabRunner = LabRunner;

/** `PrimitiveManifest.hashLabParams`. */
type HashLabParamsHook = NonNullable<PrimitiveManifest['hashLabParams']>;

/** The longest message a lab must offer: "abc". */
const MIN_LAB_BYTES = 3;

/** How far `hashLabParams` is probed for its message limit; a hook that still offers a run there has none. */
export const HASH_LAB_PROBE_BYTES = 1024;

/** The message lengths 0..`HASH_LAB_PROBE_BYTES` for which `hashLabParams` offers a lab run of `fn`. */
function offeredLengths(fnId: string, hashLabParams: HashLabParamsHook): number[] {
  return Array.from({ length: HASH_LAB_PROBE_BYTES + 1 }, (_, length) => length).filter((length) => hashLabParams(fnId, toHex(hashLabMessage(length))) !== undefined);
}

/**
 * The hook's message limit for `fn` (the longest offered length), or why the offered lengths are not
 * exactly 0..limit with limit ≥ 3 and below the probe bound.
 */
function labLimit(fnId: string, hashLabParams: HashLabParamsHook): number | string {
  const offered = offeredLengths(fnId, hashLabParams);
  if (offered[0] !== 0) return `"${fnId}": hashLabParams offers no lab run for the empty message`;
  const limit = offered.findIndex((length, index) => length !== index) - 1;
  if (limit >= 0) return `"${fnId}": hashLabParams offers no lab run for ${limit + 1} bytes but one for ${offered[limit + 1]} (it must accept exactly 0..${limit} bytes)`;
  const max = offered.at(-1)!;
  if (max < MIN_LAB_BYTES) return `"${fnId}": hashLabParams offers lab runs only up to ${max} bytes; at least ${MIN_LAB_BYTES} ("abc") are required`;
  return max === HASH_LAB_PROBE_BYTES ? `"${fnId}": hashLabParams offers lab runs beyond ${HASH_LAB_PROBE_BYTES} bytes (a lab message has a limit)` : max;
}

function labCaseProblems(fn: HashFamily['functions'][number], hashLabParams: HashLabParamsHook, runLab: HashLabRunner, length: number): string[] {
  const message = hashLabMessage(length);
  const params = hashLabParams(fn.id, toHex(message))!;
  const where = `"${fn.id}" over ${length} bytes`;
  const output = runLab(params);
  if (typeof output === 'string') return [`${where}: ${output}`];
  const digest = output[DIGEST_OUTPUT];
  if (digest === undefined) return [`${where}: run has no "${DIGEST_OUTPUT}" output`];
  const expected = fn.hash(message);
  return bytesEqual(expected, digest) ? [] : [`${where}: lab digest ${toHex(digest)}, but the Hash port gives ${toHex(expected)}`];
}

/** The hook's limit must be sound; then every `lengths` entry within it, and the limit itself, is cross-checked. */
function labFunctionProblems(fn: HashFamily['functions'][number], hashLabParams: HashLabParamsHook, runLab: HashLabRunner, lengths: readonly number[]): string[] {
  const limit = labLimit(fn.id, hashLabParams);
  if (typeof limit === 'string') return [limit];
  const checked = [...new Set([...lengths.filter((length) => length < limit), limit])];
  return checked.flatMap((length) => labCaseProblems(fn, hashLabParams, runLab, length));
}

/**
 * The port-call cross-check (docs/M7.md §1e): for every fixed-length function of the family,
 * `hashLabParams` must offer exactly the messages of 0..limit bytes (limit ≥ 3, undefined beyond it),
 * and for every message length up to the limit (and the limit itself) the lab run
 * `hashLabParams(fn.id, messageHex)` must publish `fn.hash(message)` as its digest. Needs no param names.
 */
export function hashLabProblems(family: HashFamily, hashLabParams: HashLabParamsHook, runLab: HashLabRunner, lengths: readonly number[] = HASH_LAB_MESSAGE_LENGTHS): string[] {
  return family.functions.flatMap((fn) => labFunctionProblems(fn, hashLabParams, runLab, lengths));
}
