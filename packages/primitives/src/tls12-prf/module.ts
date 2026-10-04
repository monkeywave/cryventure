import {
  allIndices,
  highlight,
  i18nRef,
  INITIAL_STEP_INDEX,
  narrationFromState,
  parseHexOrThrow,
  runPrimitive,
  scopeLevels,
  u8Regions,
  utf8Bytes,
  valueRef,
  zeroSnapshot,
  type DerivationFacet,
  type MacFunction,
  type PrimitiveRecording,
  type RunOptions,
  type RunResult,
  type ValuesFacet,
} from '@cryventure/core';
import { addChainNodes, PrfDerivationBuilder } from '../_lib/prf/derivation.ts';
import { labelSeed, pHashChain, type PHashChain } from '../_lib/prf/pHash.ts';
import { macName, PrfRecorder, prfName, recordChainBlock, recordSeedStep, type PrfBlockSteps, type PrfChainSpec } from '../_lib/prf/record.ts';
import { requireHmac } from '../_lib/prf/requireHmac.ts';
import { tls12PrfManifest, type Tls12PrfParams } from './manifest.ts';

/**
 * The TLS 1.2 PRF (RFC 5246 §5): PRF(secret, label, seed) = P_<hash>(secret, label ‖ seed) over the
 * HMAC named by `mac`. Scope levels block → op: block i holds A(i) and P(i); `seed` opens block 1
 * and `output` closes the last block.
 */
const NS = 'plugin.tls12-prf';

type Region = 'secret' | 'labelSeed' | 'a' | 'p' | 'stream' | 'output';

/** The decoded inputs of one run. */
interface Tls12Run {
  mac: MacFunction;
  secret: Uint8Array;
  label: string;
  seed: Uint8Array;
  labelSeed: Uint8Array;
  chain: PHashChain;
}

interface Tls12Steps {
  seed: number;
  blocks: PrfBlockSteps[];
  output: number;
}

function toRun(params: Tls12PrfParams, mac: MacFunction): Tls12Run {
  const secret = parseHexOrThrow(params.secret);
  const seed = parseHexOrThrow(params.seed);
  const joined = labelSeed(params.label, seed);
  return { mac, secret, label: params.label, seed, labelSeed: joined, chain: pHashChain(mac, secret, joined, Number(params.length)) };
}

function createRecorder(run: Tls12Run): PrfRecorder<Region> {
  const { mac, secret, chain } = run;
  const regions = u8Regions<Region>(
    NS,
    { secret: secret.length, labelSeed: run.labelSeed.length, a: mac.outputSize, p: mac.outputSize, stream: chain.stream.length, output: chain.output.length },
    ['labelSeed', 'a', 'p', 'stream', 'output'],
  );
  const initial = { ...zeroSnapshot(regions), secret: Array.from(secret) };
  const narration = i18nRef(`${NS}.step.initial`, {
    secretLength: secret.length,
    label: run.label,
    seedLength: run.seed.length,
    prf: prfName(mac),
    mac: macName(mac),
    hashLength: mac.outputSize,
    n: chain.p.length,
    length: chain.output.length,
  });
  return new PrfRecorder<Region>(regions, initial, narration, scopeLevels(NS, 'block', 'op'));
}

/** `output`: the first `length` bytes of the stream (the rest of the last block is discarded). */
function recordOutput(recorder: PrfRecorder<Region>, chain: PHashChain): number {
  const length = chain.output.length;
  const discarded = chain.stream.length - length;
  return recorder.step({
    op: 'output',
    writes: [{ region: 'output', offset: 0, values: Array.from(chain.output) }],
    highlights: [highlight('stream', 'read', allIndices(length)), highlight('output', 'write', allIndices(length))],
    narration: discarded === 0 ? i18nRef(`${NS}.step.outputExact`, { length, n: chain.p.length }) : i18nRef(`${NS}.step.output`, { length, streamLength: chain.stream.length, discarded }),
  });
}

function recordSteps(recorder: PrfRecorder<Region>, run: Tls12Run): Tls12Steps {
  const spec: PrfChainSpec<Region> = {
    ns: NS,
    mac: run.mac,
    keySymbol: 'secret',
    key: run.secret,
    labelSeed: run.labelSeed,
    chain: run.chain,
    regions: { key: 'secret', labelSeed: 'labelSeed', a: 'a', p: 'p', stream: 'stream' },
  };
  const last = run.chain.p.length - 1;
  const steps: Tls12Steps = { seed: 0, blocks: [], output: 0 };
  run.chain.p.forEach((_, index) =>
    recorder.scope(() => {
      if (index === 0) steps.seed = recordSeedStep(recorder, NS, 'labelSeed', run.label, run.labelSeed);
      steps.blocks.push(recordChainBlock(recorder, spec, index));
      if (index === last) steps.output = recordOutput(recorder, run.chain);
    }),
  );
  return steps;
}

function buildValues(run: Tls12Run, steps: Tls12Steps): ValuesFacet {
  return {
    kind: 'values',
    schemaVersion: 1,
    values: [
      valueRef(NS, 'secret', 'secret', Array.from(run.secret), INITIAL_STEP_INDEX),
      valueRef(NS, 'labelSeed', 'public', Array.from(run.labelSeed), steps.seed),
      valueRef(NS, 'output', 'secret', Array.from(run.chain.output), steps.output),
    ],
  };
}

/** secret, label, seed → label ‖ seed → A(i), P(i) per block → output. */
function buildDerivation(run: Tls12Run, steps: Tls12Steps): DerivationFacet {
  const builder = new PrfDerivationBuilder(NS);
  const keyNodeId = builder.add({ id: 'secret', label: 'secret', bytes: run.secret, op: 'input', valueRef: 'secret' });
  const labelId = builder.add({ id: 'label', label: 'label', labelParams: { label: run.label }, bytes: utf8Bytes(run.label), op: 'input' });
  const seedId = builder.add({ id: 'seed', label: 'seed', bytes: run.seed, op: 'input' });
  const labelSeedNodeId = builder.add({ id: 'labelSeed', label: 'labelSeed', bytes: run.labelSeed, op: 'concat', inputs: [labelId, seedId], valueRef: 'labelSeed', step: steps.seed });
  const blockIds = addChainNodes(builder, { prefix: 'prf', mac: run.mac, key: run.secret, keyNodeId, labelSeed: run.labelSeed, labelSeedNodeId, chain: run.chain, steps: steps.blocks });
  builder.add({ id: 'output', label: 'output', labelParams: { length: run.chain.output.length }, bytes: run.chain.output, op: 'truncate', inputs: blockIds, result: true, valueRef: 'output', step: steps.output });
  return builder.facet();
}

function record(params: Tls12PrfParams, mac: MacFunction): PrimitiveRecording {
  const run = toRun(params, mac);
  const recorder = createRecorder(run);
  const steps = recordSteps(recorder, run);
  const state = recorder.stateFacet();
  return {
    facets: { state, values: buildValues(run, steps), derivation: buildDerivation(run, steps), narration: narrationFromState(state) },
    output: { output: Array.from(run.chain.output) },
  };
}

/** Validates `params`, resolves the HMAC (run errors: missing member, not an HMAC) and records the PRF. */
export function run(params: Tls12PrfParams, options: RunOptions = {}): RunResult {
  const validated = tls12PrfManifest.validate(params);
  if (!validated.ok) return validated;
  const mac = requireHmac(options.resolve, validated.value.mac, NS);
  if (!mac.ok) return mac;
  return runPrimitive(tls12PrfManifest, validated.value, (value) => record(value, mac.mac));
}
