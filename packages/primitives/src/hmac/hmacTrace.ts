import { allIndices, highlight, RecordingTracer, scopeLevels, u8Regions, type Highlight, type HighlightKind, type I18nRef, type Snapshot, type StateFacet, type Write } from '@cryventure/core';
import type { HmacComputation } from './hmacCompute.ts';
import { blockNarration, initialNarration, innerMessageNarration, keyPrepNarration, outerNarration, padNarration, truncateNarration, verifyNarration } from './hmacNarration.ts';
import type { HmacOpName } from './manifest.ts';

/**
 * Records an HMAC computation as state steps (docs/M7.md §2b), one op per scope: keyPrep, ipad,
 * innerBlock, innerMessage, opad, outerBlock, outer, then truncate (t < L) and verify (expected set).
 * The midstate regions exist only when the hash exposes its chaining state.
 */
export type HmacRegion = 'key' | 'k0' | 'ipadKey' | 'innerState' | 'message' | 'inner' | 'opadKey' | 'outerState' | 'tag' | 'expected';
export type HmacOp = { op: HmacOpName };
export type HmacStateFacet = StateFacet<HmacRegion, HmacOp>;

const NS = 'plugin.hmac';

/** The state step index of each recorded op (`truncate` and `verify` only when recorded). */
export type HmacSteps = Readonly<Partial<Record<HmacOpName, number>>> & Readonly<Record<Exclude<HmacOpName, 'truncate' | 'verify'>, number>>;

export interface HmacRecording {
  state: HmacStateFacet;
  steps: HmacSteps;
}

type RegionSizes = Partial<Record<HmacRegion, number>>;

/** The regions the run starts with; the others are blank until a step writes them. */
const INPUT_REGIONS: readonly HmacRegion[] = ['key', 'message', 'expected'];

/** Region sizes in display order; empty inputs and absent midstates get no region. */
function regionSizes({ hash, key, message, inner, outer }: HmacComputation, expected: readonly number[] | undefined): RegionSizes {
  const optional = (region: HmacRegion, length: number | undefined): RegionSizes => (length === undefined || length === 0 ? {} : { [region]: length });
  return {
    ...optional('key', key.length),
    k0: hash.blockSize,
    ipadKey: hash.blockSize,
    ...optional('innerState', inner.midstate?.length),
    ...optional('message', message.length),
    inner: hash.outputSize,
    opadKey: hash.blockSize,
    ...optional('outerState', outer.midstate?.length),
    tag: hash.outputSize,
    ...optional('expected', expected?.length),
  };
}

/** Writes and highlights of the regions a run has (absent regions contribute nothing). */
class StepParts {
  constructor(private readonly sizes: RegionSizes) {}

  mark(region: HmacRegion, kind: HighlightKind, length = this.sizes[region]): Highlight<HmacRegion>[] {
    return length === undefined || length === 0 ? [] : [highlight(region, kind, allIndices(length))];
  }

  write(region: HmacRegion, values: readonly number[] | undefined): Write<HmacRegion>[] {
    return values === undefined || this.sizes[region] === undefined ? [] : [{ region, offset: 0, values: [...values] }];
  }
}

function initialSnapshot(sizes: RegionSizes, inputs: Partial<Record<HmacRegion, readonly number[]>>): Snapshot<HmacRegion> {
  const entries = (Object.entries(sizes) as [HmacRegion, number][]).map(([id, size]) => [id, [...(inputs[id] ?? new Array<number>(size).fill(0))]]);
  return Object.fromEntries(entries) as unknown as Snapshot<HmacRegion>;
}

/** A tracer that records each op in its own scope and remembers its step index. */
class HmacStepRecorder {
  readonly steps: Partial<Record<HmacOpName, number>> = {};

  constructor(private readonly tracer: RecordingTracer<HmacRegion, HmacOp>) {}

  record(op: HmacOpName, writes: Write<HmacRegion>[], highlights: Highlight<HmacRegion>[], narration: I18nRef): void {
    this.tracer.enter();
    this.tracer.step({ op, writes, highlights, narration });
    this.tracer.leave();
    this.steps[op] = this.tracer.stepCount - 1;
  }
}

/** keyPrep → ipad → innerBlock → innerMessage: K0 and the inner hash. */
function recordInner(recorder: HmacStepRecorder, parts: StepParts, computation: HmacComputation): void {
  const { k0, inner } = computation;
  recorder.record('keyPrep', parts.write('k0', k0), [...parts.mark('key', 'read'), ...parts.mark('k0', 'write')], keyPrepNarration(computation));
  recorder.record('ipad', parts.write('ipadKey', inner.paddedKey), [...parts.mark('k0', 'read'), ...parts.mark('ipadKey', 'xor')], padNarration(computation, 'ipad'));
  recorder.record('innerBlock', parts.write('innerState', inner.midstate), [...parts.mark('ipadKey', 'read'), ...parts.mark('innerState', 'write')], blockNarration(computation, 'inner'));
  const highlights = [...parts.mark('innerState', 'read'), ...parts.mark('message', 'read'), ...parts.mark('inner', 'write')];
  recorder.record('innerMessage', parts.write('inner', inner.digest), highlights, innerMessageNarration(computation));
}

/** opad → outerBlock → outer, then truncate (t < L) and verify (with an expected tag). */
function recordOuter(recorder: HmacStepRecorder, parts: StepParts, computation: HmacComputation): void {
  const { hash, outer, tag } = computation;
  recorder.record('opad', parts.write('opadKey', outer.paddedKey), [...parts.mark('k0', 'read'), ...parts.mark('opadKey', 'xor')], padNarration(computation, 'opad'));
  recorder.record('outerBlock', parts.write('outerState', outer.midstate), [...parts.mark('opadKey', 'read'), ...parts.mark('outerState', 'write')], blockNarration(computation, 'outer'));
  const highlights = [...parts.mark('outerState', 'read'), ...parts.mark('inner', 'read'), ...parts.mark('tag', 'write')];
  recorder.record('outer', parts.write('tag', outer.digest), highlights, outerNarration(computation));
  if (tag.length < hash.outputSize) recorder.record('truncate', [], parts.mark('tag', 'write', tag.length), truncateNarration(computation));
  if (computation.comparison !== undefined) recorder.record('verify', [], [...parts.mark('expected', 'read'), ...parts.mark('tag', 'xor', tag.length)], verifyNarration(computation));
}

/** Records `computation`; `expected` is the tag to verify (absent = compute only). */
export function recordHmac(computation: HmacComputation, expected?: readonly number[]): HmacRecording {
  const sizes = regionSizes(computation, expected);
  const regions = u8Regions<HmacRegion>(NS, sizes as Record<HmacRegion, number>, (Object.keys(sizes) as HmacRegion[]).filter((id) => !INPUT_REGIONS.includes(id)));
  const initial = initialSnapshot(sizes, { key: computation.key, message: computation.message, ...(expected === undefined ? {} : { expected }) });
  const tracer = new RecordingTracer<HmacRegion, HmacOp>(regions, initial, { initialNarration: initialNarration(computation) });
  const recorder = new HmacStepRecorder(tracer);
  const parts = new StepParts(sizes);
  recordInner(recorder, parts, computation);
  recordOuter(recorder, parts, computation);
  return { state: { ...tracer.toFacet(), scopeLevels: scopeLevels(NS, 'op') }, steps: recorder.steps as HmacSteps };
}
