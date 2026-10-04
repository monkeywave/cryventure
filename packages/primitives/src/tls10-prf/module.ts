import {
  allIndices,
  highlight,
  i18nRef,
  INITIAL_STEP_INDEX,
  narrationFromState,
  runPrimitive,
  scopeLevels,
  toHex,
  u8Regions,
  valueId,
  valueRef,
  xorBytes,
  zeroSnapshot,
  type DerivationFacet,
  type MacFunction,
  type PrimitiveRecording,
  type RunOptions,
  type RunResult,
  type ValuesFacet,
} from '@cryventure/core';
import { addChainNodes, addPrfInputNodes, PrfDerivationBuilder } from '../_lib/prf/derivation.ts';
import { decodePrfInputs, pHashChain, splitSecret, type PHashChain, type PrfRunInputs } from '../_lib/prf/pHash.ts';
import { PrfRecorder, prfName, recordChainBlock, recordSeedStep, type PrfBlockSteps, type PrfChainSpec } from '../_lib/prf/record.ts';
import { macDisplayName } from '../_lib/hmac/macCalls.ts';
import { requireHmacMember } from '../_lib/hmac/requireHmacMember.ts';
import { tls10PrfManifest, type Tls10PrfParams } from './manifest.ts';

/**
 * The TLS 1.0/1.1 PRF (RFC 2246 §5): S1 and S2 are the first and last ⌈|secret|/2⌉ bytes (sharing the
 * middle byte when the length is odd), PRF = P_MD5(S1, label ‖ seed) ⊕ P_SHA-1(S2, label ‖ seed).
 * Scope levels half → op: half 1 holds `split`, `seed` and the P_MD5 chain, half 2 the P_SHA-1
 * chain, `xor` and `output`.
 */
const NS = 'plugin.tls10-prf';

type Region = 'secret' | 's1' | 's2' | 'labelSeed' | 'a1' | 'p1' | 'stream1' | 'a2' | 'p2' | 'stream2' | 'output';

/** One half: its HMAC, key (S1 or S2) and P_hash chain. */
interface Half {
  mac: MacFunction;
  key: Uint8Array;
  chain: PHashChain;
}

interface Tls10Run extends PrfRunInputs {
  halves: readonly [Half, Half];
  output: Uint8Array;
}

interface Tls10Steps {
  split: number;
  seed: number;
  blocks: [PrfBlockSteps[], PrfBlockSteps[]];
  xor: number;
  output: number;
}

/** Region names, key symbol and node-id prefix of each half. */
const HALVES = [
  { key: 's1', symbol: 'S1', prefix: 'md5', regions: { key: 's1', labelSeed: 'labelSeed', a: 'a1', p: 'p1', stream: 'stream1' } },
  { key: 's2', symbol: 'S2', prefix: 'sha1', regions: { key: 's2', labelSeed: 'labelSeed', a: 'a2', p: 'p2', stream: 'stream2' } },
] as const;

function toRun(params: Tls10PrfParams, md5: MacFunction, sha1: MacFunction): Tls10Run {
  const inputs = decodePrfInputs(params);
  const { s1, s2 } = splitSecret(inputs.secret);
  const halves = [
    { mac: md5, key: s1, chain: pHashChain(md5, s1, inputs.labelSeed, inputs.length) },
    { mac: sha1, key: s2, chain: pHashChain(sha1, s2, inputs.labelSeed, inputs.length) },
  ] as const;
  return { ...inputs, halves, output: xorBytes(halves[0].chain.output, halves[1].chain.output) };
}

function createRecorder(run: Tls10Run): PrfRecorder<Region> {
  const [first, second] = run.halves;
  const sizes = (half: Half) => ({ mac: half.mac.outputSize, stream: half.chain.stream.length });
  const [one, two] = [sizes(first), sizes(second)];
  const regions = u8Regions<Region>(
    NS,
    { secret: run.secret.length, s1: first.key.length, s2: second.key.length, labelSeed: run.labelSeed.length, a1: one.mac, p1: one.mac, stream1: one.stream, a2: two.mac, p2: two.mac, stream2: two.stream, output: run.output.length },
    ['s1', 's2', 'labelSeed', 'a1', 'p1', 'stream1', 'a2', 'p2', 'stream2', 'output'],
  );
  const narration = i18nRef(`${NS}.step.initial`, {
    secretLength: run.secret.length,
    label: run.label,
    seedLength: run.seed.length,
    md5Mac: macDisplayName(first.mac),
    sha1Mac: macDisplayName(second.mac),
    length: run.output.length,
  });
  return new PrfRecorder<Region>(regions, { ...zeroSnapshot(regions), secret: Array.from(run.secret) }, narration, scopeLevels(NS, 'half', 'op'));
}

/** `split`: S1 = the first ⌈n/2⌉ bytes, S2 = the last ⌈n/2⌉ bytes; for odd n both hold the middle byte. */
function recordSplit(recorder: PrfRecorder<Region>, run: Tls10Run): number {
  const n = run.secret.length;
  const half = run.halves[0].key.length;
  const odd = n % 2 === 1;
  return recorder.step({
    op: 'split',
    writes: [
      { region: 's1', offset: 0, values: Array.from(run.halves[0].key) },
      { region: 's2', offset: 0, values: Array.from(run.halves[1].key) },
    ],
    highlights: [highlight('secret', 'read', allIndices(n)), highlight('s1', 'write', allIndices(half)), highlight('s2', 'write', allIndices(half))],
    narration: odd ? i18nRef(`${NS}.step.splitOdd`, { length: n, half, middle: half }) : i18nRef(`${NS}.step.split`, { length: n, half }),
  });
}

function chainSpec(run: Tls10Run, index: 0 | 1): PrfChainSpec<Region> {
  const half = run.halves[index];
  const names = HALVES[index];
  return { ns: NS, mac: half.mac, keySymbol: names.symbol, key: half.key, labelSeed: run.labelSeed, chain: half.chain, regions: names.regions };
}

function recordChain(recorder: PrfRecorder<Region>, run: Tls10Run, index: 0 | 1): PrfBlockSteps[] {
  const spec = chainSpec(run, index);
  return spec.chain.p.map((_, block) => recordChainBlock(recorder, spec, block));
}

/** `xor`: the first L bytes of both streams, XORed into the output. */
function recordXor(recorder: PrfRecorder<Region>, run: Tls10Run): number {
  const length = run.output.length;
  const range = allIndices(length);
  return recorder.step({
    op: 'xor',
    writes: [{ region: 'output', offset: 0, values: Array.from(run.output) }],
    highlights: [highlight('stream1', 'read', range), highlight('stream2', 'read', range), highlight('output', 'xor', range)],
    narration: i18nRef(`${NS}.step.xor`, { length, md5: prfName(run.halves[0].mac), sha1: prfName(run.halves[1].mac) }),
  });
}

/** `output`: the XOR is the PRF output; says how many bytes of each stream went unused. */
function recordOutput(recorder: PrfRecorder<Region>, run: Tls10Run): number {
  const length = run.output.length;
  const [first, second] = run.halves;
  return recorder.step({
    op: 'output',
    writes: [],
    highlights: [highlight('output', 'read', allIndices(length))],
    narration: i18nRef(`${NS}.step.output`, {
      length,
      output: toHex(run.output),
      md5Blocks: first.chain.p.length,
      md5Unused: first.chain.stream.length - length,
      sha1Blocks: second.chain.p.length,
      sha1Unused: second.chain.stream.length - length,
    }),
  });
}

function recordSteps(recorder: PrfRecorder<Region>, run: Tls10Run): Tls10Steps {
  const first = recorder.scope(() => ({
    split: recordSplit(recorder, run),
    seed: recordSeedStep(recorder, NS, 'labelSeed', run.label, run.labelSeed),
    blocks: recordChain(recorder, run, 0),
  }));
  return recorder.scope(() => {
    const blocks = recordChain(recorder, run, 1);
    const xor = recordXor(recorder, run);
    return { split: first.split, seed: first.seed, blocks: [first.blocks, blocks], xor, output: recordOutput(recorder, run) };
  });
}

function buildValues(run: Tls10Run, steps: Tls10Steps): ValuesFacet {
  return {
    kind: 'values',
    schemaVersion: 1,
    values: [
      valueRef(NS, 'secret', 'secret', Array.from(run.secret), INITIAL_STEP_INDEX),
      valueRef(NS, 's1', 'secret', Array.from(run.halves[0].key), steps.split),
      valueRef(NS, 's2', 'secret', Array.from(run.halves[1].key), steps.split),
      valueRef(NS, 'labelSeed', 'public', Array.from(run.labelSeed), steps.seed),
      valueRef(NS, 'output', 'secret', Array.from(run.output), steps.xor),
    ],
  };
}

/** secret → S1, S2; label ‖ seed; the two chains; each stream cut to L bytes; their XOR. */
function buildDerivation(run: Tls10Run, steps: Tls10Steps): DerivationFacet {
  const builder = new PrfDerivationBuilder(NS);
  const { secretId, labelSeedId: labelSeedNodeId } = addPrfInputNodes(builder, run, steps.seed);
  const length = run.output.length;
  const streamIds = HALVES.map((names, index) => {
    const half = run.halves[index]!;
    const keyNodeId = builder.add({ id: names.key, label: names.key, bytes: half.key, op: 'split', inputs: [secretId], result: true, valueRef: names.key, step: steps.split });
    const blockIds = addChainNodes(builder, { prefix: names.prefix, mac: half.mac, key: half.key, keyNodeId, labelSeed: run.labelSeed, labelSeedNodeId, chain: half.chain, steps: steps.blocks[index]! });
    return builder.add({ id: valueId([names.prefix], 'stream'), label: 'stream', labelParams: { prf: prfName(half.mac), length }, bytes: half.chain.output, op: 'truncate', inputs: blockIds });
  });
  builder.add({ id: 'output', label: 'output', labelParams: { length }, bytes: run.output, op: 'xor', inputs: streamIds, result: true, valueRef: 'output', step: steps.xor });
  return builder.facet();
}

function record(params: Tls10PrfParams, md5: MacFunction, sha1: MacFunction): PrimitiveRecording {
  const run = toRun(params, md5, sha1);
  const recorder = createRecorder(run);
  const steps = recordSteps(recorder, run);
  const state = recorder.stateFacet();
  return {
    facets: { state, values: buildValues(run, steps), derivation: buildDerivation(run, steps), narration: narrationFromState(state) },
    output: { output: Array.from(run.output) },
  };
}

/** Validates `params`, resolves both HMACs (run errors: missing member, not an HMAC) and records the PRF. */
export function run(params: Tls10PrfParams, options: RunOptions = {}): RunResult {
  const validated = tls10PrfManifest.validate(params);
  if (!validated.ok) return validated;
  const md5 = requireHmacMember(options.resolve, validated.value.md5Mac, NS);
  if (!md5.ok) return md5;
  const sha1 = requireHmacMember(options.resolve, validated.value.sha1Mac, NS);
  if (!sha1.ok) return sha1;
  return runPrimitive(tls10PrfManifest, validated.value, (value) => record(value, md5.mac, sha1.mac));
}
