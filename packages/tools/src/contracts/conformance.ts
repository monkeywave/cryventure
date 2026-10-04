import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toHex, type PrimitiveModule, type RunOptions } from '@cryventure/core';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import type { PluginPackage } from './catalogs.ts';
import { isRecord } from './jsonValues.ts';

/**
 * The generic conformance format every primitive ships as `vectors/conformance.json`
 * (documented in docs/EXTENDING.md): named param sets and the expected `TraceBundle.output`
 * entries as lowercase hex. Plugin-specific vector files may live alongside it.
 */
export interface ConformanceCase {
  name: string;
  params: Record<string, unknown>;
  /** Expected `output[key]` bytes, as hex. */
  outputs: Record<string, string>;
}

export interface ConformanceVectors {
  /** Where the expected values come from (a standard, or an independent implementation). */
  source: string;
  cases: ConformanceCase[];
}

export const CONFORMANCE_FILE = 'conformance.json';

/** Path of a plugin's conformance file: `packages/<package>/src/<id>/vectors/conformance.json`. */
export function conformanceFile(pluginPackage: PluginPackage, id: string, root: string = REPO_ROOT): string {
  return join(root, 'packages', pluginPackage, 'src', id, 'vectors', CONFORMANCE_FILE);
}

/** The plugin's parsed conformance file, or `undefined` when it ships none. */
export function loadConformanceVectors(pluginPackage: PluginPackage, id: string, root: string = REPO_ROOT): unknown {
  const file = conformanceFile(pluginPackage, id, root);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as unknown) : undefined;
}

const HEX = /^(?:[0-9a-f]{2})*$/;

function caseFormatProblems(value: unknown, index: number): string[] {
  const at = `cases[${index}]`;
  if (!isRecord(value)) return [`${at} is not an object`];
  const problems: string[] = [];
  if (typeof value['name'] !== 'string' || value['name'] === '') problems.push(`${at}.name must be a non-empty string`);
  if (!isRecord(value['params'])) problems.push(`${at}.params must be an object`);
  const outputs = value['outputs'];
  if (!isRecord(outputs) || Object.keys(outputs).length === 0) return [...problems, `${at}.outputs must name at least one output`];
  Object.entries(outputs).forEach(([key, hex]) => {
    if (typeof hex !== 'string' || !HEX.test(hex)) problems.push(`${at}.outputs.${key} must be lowercase hex bytes`);
  });
  return problems;
}

/** Shape problems of a conformance file; at least one case is required. */
export function conformanceFormatProblems(value: unknown): string[] {
  if (value === undefined) return [`no vectors/${CONFORMANCE_FILE}`];
  if (!isRecord(value)) return ['the conformance file is not an object'];
  const problems: string[] = [];
  if (typeof value['source'] !== 'string' || value['source'] === '') problems.push('source must cite where the expected values come from');
  const cases = value['cases'];
  if (!Array.isArray(cases) || cases.length === 0) return [...problems, 'cases must hold at least one case'];
  return [...problems, ...cases.flatMap(caseFormatProblems)];
}

/** Expected outputs that differ from (or are missing in) the actual `TraceBundle.output`. */
export function outputProblems(actual: Record<string, number[]>, expected: Record<string, string>): string[] {
  return Object.entries(expected).flatMap(([key, hex]) => {
    const bytes = actual[key];
    if (bytes === undefined) return [`output "${key}" is missing`];
    const actualHex = toHex(bytes);
    return actualHex === hex ? [] : [`output "${key}" is ${actualHex}, expected ${hex}`];
  });
}

/** Run options for one case's params (e.g. `runOptionsFor` to resolve port params). */
export type PrepareRun = (params: unknown) => Promise<RunOptions>;

async function caseProblems<P>(module: PrimitiveModule<P>, testCase: ConformanceCase, prepare: PrepareRun): Promise<string[]> {
  const result = module.run(testCase.params as P, await prepare(testCase.params));
  const problems = result.ok ? outputProblems(result.trace.output, testCase.outputs) : [`run() rejected params: ${JSON.stringify(result.error)}`];
  return problems.map((problem) => `${testCase.name}: ${problem}`);
}

/** Runs every case through the module (with `prepare`d options); problems are prefixed with the case name. */
export async function conformanceProblems<P>(module: PrimitiveModule<P>, vectors: ConformanceVectors, prepare: PrepareRun = async () => ({})): Promise<string[]> {
  const problems = await Promise.all(vectors.cases.map((testCase) => caseProblems(module, testCase, prepare)));
  return problems.flat();
}
