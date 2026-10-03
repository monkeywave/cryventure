import { parseHexToArray } from '../bytes.ts';
import type { ChainFacet } from '../facets/chain.ts';
import { narrationFromState } from '../facets/narration.ts';
import type { AnyStateFacet } from '../facets/state.ts';
import type { ValueRef } from '../facets/values.ts';
import type { WireFacet } from '../facets/wire.ts';
import type { I18nRef } from '../i18n.ts';
import { scopeLevels } from '../plugin/labels.ts';
import { runPrimitive, type PrimitiveRecording } from '../plugin/runPrimitive.ts';
import { processedBytes, type ModeBlockTrace, type PaddedModeBlocks, type PaddedModeRun } from '../recording/blockModeRecording.ts';
import type { PrimitiveManifest, RunOptions, RunResult } from '../registry.ts';
import { blockModeValues } from './blockModeFacets.ts';
import { alignmentError, assertMatchesReference, blockModeOutputs, prepareBlockCipher, type ModeCommonParams, type ModeDirection, type ModePadding } from './modeKit.ts';

/**
 * The shared `run` of the padded block-mode producers (`ecb`, `cbc`; docs/M3.md §4): validate,
 * resolve the cipher, check the block lengths, record, assert against the untraced core reference
 * and assemble the state, values, narration, chain and wire facets.
 */

export interface PaddedModeParams extends ModeCommonParams {
  direction: ModeDirection;
  padding: ModePadding;
}

/** What the producer records; the state facet's scope levels are added here. */
export interface PaddedModeProducerRecording<B extends ModeBlockTrace> extends PaddedModeBlocks<B> {
  facet: AnyStateFacet;
}

export interface PaddedModeProducer<P extends PaddedModeParams, Run extends PaddedModeRun, B extends ModeBlockTrace> {
  manifest: PrimitiveManifest<P>;
  /** The run from validated params: `base` plus the mode's own inputs (e.g. the IV). */
  toRun(base: PaddedModeRun, params: P): Run;
  /** Run errors checked before the input alignment (e.g. a wrong IV length). */
  runErrors?(run: Run): I18nRef | undefined;
  record(run: Run): PaddedModeProducerRecording<B>;
  /** The untraced core reference over the processed input (padded plaintext, or the ciphertext). */
  reference(run: Run, input: Uint8Array): Uint8Array;
  /** Values present from the initial state on besides key and input (e.g. the IV). */
  initialValues?(run: Run): ValueRef[];
  chain(recording: PaddedModeBlocks<B>, run: Run): ChainFacet;
  wire(recording: PaddedModeBlocks<B>, run: Run): WireFacet;
}

/** The run error when the input must be whole blocks but is not: when decrypting, or without padding. */
function alignmentErrors(namespace: string, { cipher, data, direction, padding }: PaddedModeRun): I18nRef | undefined {
  const needsAlignment = direction === 'decrypt' || padding === 'none';
  return needsAlignment ? alignmentError(cipher, data.length, `${namespace}.error.notAligned`) : undefined;
}

function recordBundle<P extends PaddedModeParams, Run extends PaddedModeRun, B extends ModeBlockTrace>(producer: PaddedModeProducer<P, Run, B>, run: Run): PrimitiveRecording {
  const namespace = producer.manifest.i18nNamespace;
  const recording = producer.record(run);
  const processed = processedBytes(recording);
  const input = Uint8Array.from(recording.blocks.flatMap((block) => block.input));
  assertMatchesReference(processed, producer.reference(run, input), producer.manifest.id);
  const facet = { ...recording.facet, scopeLevels: scopeLevels(namespace, 'block', 'op') };
  const output = blockModeOutputs(run.direction, processed, recording.unpad?.result);
  const valuesInput = { direction: run.direction, key: Array.from(run.key), data: run.data, output, lastStep: facet.steps.length - 1 };
  const initial = producer.initialValues?.(run);
  return {
    facets: {
      state: facet,
      values: blockModeValues(namespace, initial === undefined ? valuesInput : { ...valuesInput, initial }),
      narration: narrationFromState(facet),
      chain: producer.chain(recording, run),
      wire: producer.wire(recording, run),
    },
    output: { [output.name]: output.bytes },
  };
}

/** Validates `params`, resolves the cipher, records the mode and returns a TraceBundle (run errors: missing cipher, key size, the mode's own, alignment). */
export function runPaddedMode<P extends PaddedModeParams, Run extends PaddedModeRun, B extends ModeBlockTrace>(
  producer: PaddedModeProducer<P, Run, B>,
  params: unknown,
  options: RunOptions = {},
): RunResult {
  const { manifest } = producer;
  const validated = manifest.validate(params);
  if (!validated.ok) return validated;
  const valid = validated.value;
  const prepared = prepareBlockCipher(options.resolve, valid.cipher, valid.keyHex);
  if (!prepared.ok) return prepared;
  const base: PaddedModeRun = { cipher: prepared.cipher, key: prepared.key, data: parseHexToArray(valid.inputHex), direction: valid.direction, padding: valid.padding };
  const run = producer.toRun(base, valid);
  const error = producer.runErrors?.(run) ?? alignmentErrors(manifest.i18nNamespace, run);
  if (error !== undefined) return { ok: false, error };
  return runPrimitive(manifest, valid, () => recordBundle(producer, run));
}
