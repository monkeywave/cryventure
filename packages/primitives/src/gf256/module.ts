import { INITIAL_STEP_INDEX, narrationFromState, parseHexOrThrow, runPrimitive, valueRef, type RunOptions, type RunResult, type ValuesFacet } from '@cryventure/core';
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

/** The operands exist from the initial state on (step −1); the result after the last step. */
function buildValues(op: Gf256Params['op'], a: number, b: number, result: number, lastStep: number): ValuesFacet {
  const operand = (name: 'a' | 'b', byte: number) => valueRef(NS, name, 'public', [byte], INITIAL_STEP_INDEX);
  const operands = op === 'gmul' ? [operand('a', a), operand('b', b)] : [operand('a', a)];
  return { kind: 'values', schemaVersion: 1, values: [...operands, valueRef(NS, 'result', 'state', [result], lastStep)] };
}

/** Validates `params`, runs the traced operation and returns a TraceBundle. */
export function run(params: Gf256Params, _options: RunOptions = {}): RunResult {
  return runPrimitive(gf256Manifest, params, ({ op, aHex, bHex }) => {
    const a = validatedByte(aHex);
    const b = validatedByte(bHex);
    const { recorder, result } = record(op, a, b);
    const state = recorder.stateFacet();
    return {
      facets: {
        state,
        values: buildValues(op, a, b, result, state.steps.length - 1),
        narration: narrationFromState(state),
        math: recorder.mathFacet(),
      },
      output: { result: [result] },
    };
  });
}
