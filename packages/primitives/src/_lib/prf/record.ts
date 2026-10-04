import {
  allIndices,
  blockIndices,
  highlight,
  i18nRef,
  RecordingTracer,
  toHex,
  type I18nRef,
  type MacFunction,
  type RegionSpec,
  type ScopeLevel,
  type Snapshot,
  type StateFacet,
  type StepInput,
} from '@cryventure/core';
import type { PHashChain } from './pHash.ts';

/**
 * The recorder both TLS PRF producers share (docs/M7.md §2f): one state step per op, each in its
 * own `op` scope under the producer's outer level (`block` for TLS 1.2, `half` for TLS 1.0), and
 * the P_hash steps `a` (A(i) = HMAC(key, A(i−1))) and `p` (P(i) = HMAC(key, A(i) ‖ label ‖ seed)).
 * Narration keys live in the producer's namespace (`<ns>.step.*`), so both catalogs carry them.
 */

export type PrfOpName = 'split' | 'seed' | 'a' | 'p' | 'xor' | 'output';
export type PrfOp = { op: PrfOpName };

/** The display name of an HMAC member, e.g. `hmac-sha-256` → `HMAC-SHA-256`. */
export function macName(mac: Pick<MacFunction, 'id'>): string {
  return mac.id.toUpperCase();
}

/** P_hash's name for an HMAC member, e.g. `P_SHA-256` (the hash's name after `hmac-`). */
export function prfName(mac: Pick<MacFunction, 'id'>): string {
  return `P_${macName(mac).replace(/^HMAC-/, '')}`;
}

export class PrfRecorder<R extends string> {
  private readonly tracer: RecordingTracer<R, PrfOp>;

  constructor(
    regions: RegionSpec<R>[],
    initial: Snapshot<R>,
    initialNarration: I18nRef,
    private readonly levels: ScopeLevel[],
  ) {
    this.tracer = new RecordingTracer<R, PrfOp>(regions, initial, { initialNarration });
  }

  /** Runs `body` in the next scope of the outer level (a block or a half). */
  scope<T>(body: () => T): T {
    this.tracer.enter();
    try {
      return body();
    } finally {
      this.tracer.leave();
    }
  }

  /** Records one step in its own `op` scope and returns its step index. */
  step(input: StepInput<R, PrfOp>): number {
    this.tracer.enter();
    this.tracer.step(input);
    this.tracer.leave();
    return this.tracer.stepCount - 1;
  }

  stateFacet(): StateFacet<R, PrfOp> {
    return { ...this.tracer.toFacet(), scopeLevels: this.levels };
  }
}

/** The regions one P_hash chain uses: its key (the secret, S1 or S2), A(i), P(i) and the stream P(1) ‖ … ‖ P(n). */
export interface PrfChainRegions<R extends string> {
  key: R;
  labelSeed: R;
  a: R;
  p: R;
  stream: R;
}

/** One P_hash chain as recorded: the values, the MAC, how narration names the key, and where it lives. */
export interface PrfChainSpec<R extends string> {
  ns: string;
  mac: MacFunction;
  /** The key's symbol in narration formulas: `secret`, `S1` or `S2`. */
  keySymbol: string;
  /** The chain's key and its HMAC input label ‖ seed (= A(0)). */
  key: Uint8Array;
  labelSeed: Uint8Array;
  chain: PHashChain;
  regions: PrfChainRegions<R>;
}

/** The step indices of one block's `a` and `p` steps. */
export interface PrfBlockSteps {
  a: number;
  p: number;
}

/** The `seed` step: label ‖ seed written to `region`. */
export function recordSeedStep<R extends string>(recorder: PrfRecorder<R>, ns: string, region: R, label: string, joined: Uint8Array): number {
  return recorder.step({
    op: 'seed',
    writes: [{ region, offset: 0, values: Array.from(joined) }],
    highlights: [highlight(region, 'write', allIndices(joined.length))],
    narration: i18nRef(`${ns}.step.seed`, { label, labelLength: label.length, seedLength: joined.length - label.length, total: joined.length }),
  });
}

function chainParams<R extends string>(spec: PrfChainSpec<R>, index: number) {
  return { prf: prfName(spec.mac), mac: macName(spec.mac), key: spec.keySymbol, n: spec.chain.p.length, i: index + 1 };
}

/** Block 1's narration says "A(1)" and "block 1" in its text, so it takes no `i`. */
function withoutIndex<T extends { i: number }>({ i: _i, ...rest }: T): Omit<T, 'i'> {
  return rest;
}

/** A(i) = HMAC(key, A(i−1)); A(0) is label ‖ seed, so block 1 reads that region. */
function recordA<R extends string>(recorder: PrfRecorder<R>, spec: PrfChainSpec<R>, index: number): number {
  const { regions, chain, ns } = spec;
  const a = chain.a[index]!;
  const source = index === 0 ? regions.labelSeed : regions.a;
  const params = { ...chainParams(spec, index), value: toHex(a) };
  return recorder.step({
    op: 'a',
    writes: [{ region: regions.a, offset: 0, values: Array.from(a) }],
    highlights: [highlight(regions.key, 'read', allIndices(spec.key.length)), highlight(source, 'read', allIndices(index === 0 ? spec.labelSeed.length : a.length)), highlight(regions.a, 'write', allIndices(a.length))],
    narration: index === 0 ? i18nRef(`${ns}.step.aFirst`, withoutIndex(params)) : i18nRef(`${ns}.step.a`, { ...params, prev: index }),
  });
}

/** P(i) = HMAC(key, A(i) ‖ label ‖ seed), written to `p` and to its slot in the stream. */
function recordP<R extends string>(recorder: PrfRecorder<R>, spec: PrfChainSpec<R>, index: number): number {
  const { regions, chain, ns } = spec;
  const p = chain.p[index]!;
  const offset = index * p.length;
  return recorder.step({
    op: 'p',
    writes: [
      { region: regions.p, offset: 0, values: Array.from(p) },
      { region: regions.stream, offset, values: Array.from(p) },
    ],
    highlights: [
      highlight(regions.key, 'read', allIndices(spec.key.length)),
      highlight(regions.a, 'read', allIndices(p.length)),
      highlight(regions.labelSeed, 'read', allIndices(spec.labelSeed.length)),
      highlight(regions.p, 'write', allIndices(p.length)),
      highlight(regions.stream, 'write', blockIndices(index, p.length, offset + p.length)),
    ],
    narration: i18nRef(`${ns}.step.p`, { ...chainParams(spec, index), value: toHex(p), from: offset + 1, to: offset + p.length }),
  });
}

/** Block `index` of the chain: its `a` and `p` steps in the current scope. */
export function recordChainBlock<R extends string>(recorder: PrfRecorder<R>, spec: PrfChainSpec<R>, index: number): PrfBlockSteps {
  return { a: recordA(recorder, spec, index), p: recordP(recorder, spec, index) };
}
