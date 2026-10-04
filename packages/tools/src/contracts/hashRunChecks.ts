import { bytesEqual, hashFunction, paramFieldsOf, parseHexOrThrow, toHex, utf8Bytes, type HashFamily, type ParamField, type PrimitiveManifest } from '@cryventure/core';

/**
 * Cross-check of a `Hash` producer's traced `run()` against its own untraced port (docs/M5.md §1):
 * for every case whose `algorithm` is a function id of the family, `hash(message)` must equal
 * `run(params).output.digest`, so a port cannot drift from what the lessons show.
 *
 * The message bytes are derived generically from the param fields: the manifest's one `text`
 * param holds the message, read as UTF-8, or as hex when an `encoding` param says `"hex"`.
 */

export type HashRunManifest = Pick<PrimitiveManifest, 'implements' | 'outputs' | 'paramFields' | 'defaults' | 'i18nNamespace'>;

export interface HashRunCase {
  name: string;
  params: unknown;
  /** `run(params).output`. */
  output: Record<string, number[]>;
}

const ALGORITHM_PARAM = 'algorithm';
const ENCODING_PARAM = 'encoding';
const DIGEST_OUTPUT = 'digest';

const paramsRecord = (params: unknown): Record<string, unknown> => (typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {});

/** Whether the cross-check applies: implements `Hash`, declares a `digest` output and an `algorithm` select param. */
export function checksHashRuns(manifest: HashRunManifest): boolean {
  const hasAlgorithm = paramFieldsOf(manifest).some((field) => field.name === ALGORITHM_PARAM && field.kind === 'select');
  return manifest.implements.includes('Hash') && manifest.outputs?.[DIGEST_OUTPUT] !== undefined && hasAlgorithm;
}

function decode(text: string, encoding: unknown, name: string): Uint8Array | string {
  if (encoding === undefined || encoding === 'utf8') return utf8Bytes(text);
  if (encoding !== 'hex') return `encoding "${String(encoding)}" is not "utf8" or "hex"`;
  try {
    return parseHexOrThrow(text);
  } catch (error) {
    return `param "${name}" is not hex (${error instanceof Error ? error.message : String(error)})`;
  }
}

/** The message bytes `params` describe, or why they cannot be derived. */
export function hashMessageBytes(fields: readonly ParamField[], params: unknown): Uint8Array | string {
  const textFields = fields.filter((field) => field.kind === 'text');
  if (textFields.length !== 1) return `expected exactly one text param holding the message, found ${textFields.length}`;
  const { name } = textFields[0]!;
  const record = paramsRecord(params);
  const text = record[name];
  if (typeof text !== 'string') return `param "${name}" is not a string`;
  return decode(text, record[ENCODING_PARAM], name);
}

function caseProblems(fields: readonly ParamField[], family: HashFamily, testCase: HashRunCase): string[] {
  const algorithm = paramsRecord(testCase.params)[ALGORITHM_PARAM];
  const fn = typeof algorithm === 'string' ? hashFunction(family, algorithm) : undefined;
  if (fn === undefined) return [];
  const digest = testCase.output[DIGEST_OUTPUT];
  if (digest === undefined) return [`run has no "${DIGEST_OUTPUT}" output`];
  const message = hashMessageBytes(fields, testCase.params);
  if (typeof message === 'string') return [`cannot derive the message bytes from params (${message})`];
  const expected = fn.hash(message);
  return bytesEqual(expected, digest) ? [] : [`run digest ${toHex(digest)}, but Hash port "${fn.id}" gives ${toHex(expected)}`];
}

/** Cases whose run digest differs from the family's function over the same message; other algorithms are skipped. */
export function hashRunProblems(manifest: HashRunManifest, family: HashFamily, cases: readonly HashRunCase[]): string[] {
  const fields = paramFieldsOf(manifest);
  return cases.flatMap((testCase) => caseProblems(fields, family, testCase).map((problem) => `${testCase.name}: ${problem}`));
}
