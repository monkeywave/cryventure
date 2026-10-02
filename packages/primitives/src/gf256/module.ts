import {
  facetKey,
  narrationFromState,
  parseHexOrThrow,
  valueId,
  type RunOptions,
  type RunResult,
  type TraceBundle,
  type ValueRef,
  type ValueRole,
  type ValuesFacet,
} from '@cryventure/core';
import { recordGinv } from './ginv.ts';
import { recordGmul } from './gmul.ts';
import { gf256Manifest, type Gf256Params } from './manifest.ts';
import { NS, type Gf256Recorder } from './trace.ts';
import { recordXtime } from './xtime.ts';

/** GF(2^8) calculator producer: traces xtime, gmul or ginv with state/values/narration/math facets. */

/** Decodes the single byte that validation has already accepted. */
function validatedByte(hex: string): number {
  return parseHexOrThrow(hex)[0]!;
}

function record(op: Gf256Params['op'], a: number, b: number): { recorder: Gf256Recorder; result: number } {
  if (op === 'xtime') return recordXtime(a);
  if (op === 'gmul') return recordGmul(a, b);
  return recordGinv(a);
}

function valueRef(name: string, role: ValueRole, byte: number, createdAt: number): ValueRef {
  return { id: valueId([], name), labelKey: `${NS}.value.${name}`, role, bytes: [byte], createdAt };
}

function buildValues(op: Gf256Params['op'], a: number, b: number, result: number, lastStep: number): ValuesFacet {
  const operands = op === 'gmul' ? [valueRef('a', 'public', a, 0), valueRef('b', 'public', b, 0)] : [valueRef('a', 'public', a, 0)];
  return { kind: 'values', schemaVersion: 1, values: [...operands, valueRef('result', 'state', result, lastStep)] };
}

/** Validates `params`, runs the traced operation and returns a TraceBundle. */
export function run(params: Gf256Params, _options: RunOptions = {}): RunResult {
  const validated = gf256Manifest.validate(params);
  if (!validated.ok) return validated;
  const { op } = validated.value;
  const a = validatedByte(validated.value.aHex);
  const b = validatedByte(validated.value.bHex);
  const { recorder, result } = record(op, a, b);
  const state = recorder.stateFacet();
  const trace: TraceBundle = {
    schemaVersion: 1,
    producer: { kind: 'primitive', id: 'gf256', apiVersion: 1 },
    provenance: 'modeled',
    params: validated.value,
    facets: {
      [facetKey('state')]: state,
      [facetKey('values')]: buildValues(op, a, b, result, state.steps.length - 1),
      [facetKey('narration')]: narrationFromState(state),
      [facetKey('math')]: recorder.mathFacet(),
    },
    output: { result: [result] },
  };
  return { ok: true, trace };
}
