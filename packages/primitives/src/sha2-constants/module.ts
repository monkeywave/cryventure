import { INITIAL_STEP_INDEX, narrationFromState, parseHexToArray, runPrimitive, valueRef, type RunOptions, type RunResult, type ValuesFacet } from '@cryventure/core';
import { CONSTANT_SPECS } from './constantSpecs.ts';
import { recordConstants, type ConstantsRecording } from './constantsTrace.ts';
import { FIPS_TABLES } from './fipsTables.ts';
import { sha2ConstantsManifest, type Sha2ConstantsParams } from './manifest.ts';

/** sha2-constants producer: derives a SHA-2 constant table from prime roots and checks it against FIPS 180-4. */
const NS = 'plugin.sha2-constants';

/** The table's bytes: its big-endian words, concatenated. */
const hexBytes = (hexWords: readonly string[]): number[] => parseHexToArray(hexWords.join(''));

/** Each word once its step derives it; the whole table after the last word; the FIPS table from the start. */
export function buildConstantsValues(recording: ConstantsRecording, fips: readonly string[]): ValuesFacet {
  const { words, hexWords } = recording;
  // Scope path [index] gives the id `wordValueId(index)` that the wordops terms link to.
  const perWord = words.map(({ index }) => valueRef(NS, 'word', 'constant', hexBytes([hexWords[index]!]), index, [index]));
  const values = [
    valueRef(NS, 'fips', 'constant', hexBytes(fips), INITIAL_STEP_INDEX),
    ...perWord,
    valueRef(NS, 'constants', 'constant', hexBytes(hexWords), words.length - 1),
  ];
  return { kind: 'values', schemaVersion: 1, values };
}

/** Validates `params`, derives the chosen table word by word and returns a TraceBundle. */
export function run(params: Sha2ConstantsParams, _options: RunOptions = {}): RunResult {
  return runPrimitive(sha2ConstantsManifest, params, ({ constant }) => {
    const fips = FIPS_TABLES[constant];
    const recording = recordConstants(constant, CONSTANT_SPECS[constant], fips);
    return {
      facets: {
        state: recording.state,
        values: buildConstantsValues(recording, fips),
        narration: narrationFromState(recording.state),
        wordops: recording.wordops,
      },
      output: { constants: hexBytes(recording.hexWords) },
    };
  });
}
