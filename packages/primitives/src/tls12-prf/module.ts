import {
  allIndices,
  highlight,
  i18nRef,
  INITIAL_STEP_INDEX,
  narrationFromState,
  runPrimitive,
  scopeLevels,
  u8Regions,
  valueRef,
  zeroSnapshot,
  type DerivationFacet,
  type MacFunction,
  type PrimitiveRecording,
  type RunOptions,
  type RunResult,
  type ValuesFacet,
} from '@cryventure/core';
import { addChainNodes, addPrfInputNodes, PrfDerivationBuilder } from '../_lib/prf/derivation.ts';
import { decodePrfInputs, pHashChain, type PHashChain, type PrfRunInputs } from '../_lib/prf/pHash.ts';
import { PrfRecorder, prfName, recordChainBlock, recordSeedStep, type PrfBlockSteps, type PrfChainSpec } from '../_lib/prf/record.ts';
import { macDisplayName } from '../_lib/hmac/macCalls.ts';
import { requireHmacMember } from '../_lib/hmac/requireHmacMember.ts';
import { tls12PrfManifest, type Tls12PrfParams } from './manifest.ts';

/**
 * The TLS 1.2 PRF (RFC 5246 §5): PRF(secret, label, seed) = P_<hash>(secret, label ‖ seed) over the
 * HMAC named by `mac`. Scope levels block → op: block i holds A(i) and P(i); `seed` opens block 1
 * and `output` closes the last block.
 */
const NS = 'plugin.tls12-prf';

type Region = 'secret' | 'labelSeed' | 'a' | 'p' | 'stream' | 'output';

/** The decoded inputs of one run, its HMAC and P_hash chain. */
interface Tls12Run extends PrfRunInputs {
  mac: MacFunction;
  chain: PHashChain;
}

interface Tls12Steps {
  seed: number;
  blocks: PrfBlockSteps[];
  output: number;
}

function toRun(params: Tls12PrfParams, mac: MacFunction): Tls12Run {
  const inputs = decodePrfInputs(params);
  return { ...inputs, mac, chain: pHashChain(mac, inputs.secret, inputs.labelSeed, inputs.length) };
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
    mac: macDisplayName(mac),
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
  const { secretId, labelSeedId } = addPrfInputNodes(builder, run, steps.seed);
  const blockIds = addChainNodes(builder, { prefix: 'prf', mac: run.mac, key: run.secret, keyNodeId: secretId, labelSeed: run.labelSeed, labelSeedNodeId: labelSeedId, chain: run.chain, steps: steps.blocks });
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
  const mac = requireHmacMember(options.resolve, validated.value.mac, NS);
  if (!mac.ok) return mac;
  return runPrimitive(tls12PrfManifest, validated.value, (value) => record(value, mac.mac));
}
