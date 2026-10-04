import {
  allIndices,
  blockCount,
  highlight,
  i18nRef,
  RecordingTracer,
  toHex,
  u8Regions,
  zeroSnapshot,
  type Highlight,
  type I18nRef,
  type MacFunction,
  type RegionSpec,
  type Snapshot,
  type StateFacet,
} from '@cryventure/core';
import {
  extractSalt,
  hkdfExpandBlocks,
  hkdfLabel,
  hkdfExtract,
  okmOf,
  type ExpandBlock,
  type HkdfLabelStruct,
} from './hkdf.ts';
import type { HkdfMode, HkdfOpName } from './manifest.ts';
import { macDisplayName } from '../_lib/hmac/macCalls.ts';

/** Traced HKDF (RFC 5869, RFC 8446 §7.1): hkdfLabel? → extract? → expand per block → output. Flat steps. */
export type HkdfRegion = 'ikm' | 'salt' | 'prk' | 'info' | 'hkdfLabel' | 't' | 'okm';
export type HkdfOp = { op: HkdfOpName };

const NS = 'plugin.hkdf';

/** The decoded inputs of one run; `prk` is used only by the expand modes. */
export interface HkdfRun {
  mode: HkdfMode;
  mac: MacFunction;
  ikm: number[];
  salt: number[];
  prk: number[];
  info: number[];
  length: number;
  label: string;
  context: number[];
}

/** One recorded Expand block with the step that computes it. */
export interface RecordedBlock extends ExpandBlock {
  step: number;
}

/** What the facets need besides the state facet: every derived value and the step that produces it (−1 = initial). */
export interface HkdfRecording {
  state: StateFacet<HkdfRegion, HkdfOp>;
  /** The HMAC key Extract uses (HashLen zeros for an empty salt). */
  salt: number[];
  prk: number[];
  /** −1 when PRK is an input (expand modes). */
  prkStep: number;
  /** The info Expand uses: `info`, or the HkdfLabel bytes. */
  info: number[];
  label?: HkdfLabelStruct & { step: number };
  blocks: RecordedBlock[];
  okm: number[];
  okmStep: number;
}

export const extracts = (mode: HkdfMode) => mode === 'hkdf' || mode === 'extract';
export const expands = (mode: HkdfMode) => mode !== 'extract';


type Tracer = RecordingTracer<HkdfRegion, HkdfOp>;

/** Regions in display order; only those the mode uses and that hold bytes. */
function regionSizes(
  run: HkdfRun,
  saltBytes: number,
  labelBytes: number,
): Partial<Record<HkdfRegion, number>> {
  const hashLen = run.mac.outputSize;
  const sizes: Partial<Record<HkdfRegion, number>> = {};
  if (extracts(run.mode)) Object.assign(sizes, { ikm: run.ikm.length, salt: saltBytes });
  sizes.prk = extracts(run.mode) ? hashLen : run.prk.length;
  if (run.mode === 'expand-label') sizes.hkdfLabel = labelBytes;
  else if (expands(run.mode)) sizes.info = run.info.length;
  if (expands(run.mode)) Object.assign(sizes, { t: hashLen, okm: run.length });
  return Object.fromEntries(Object.entries(sizes).filter(([, size]) => size > 0));
}

const BLANK: readonly HkdfRegion[] = ['prk', 'hkdfLabel', 't', 'okm'];

function regionSpecs(
  sizes: Partial<Record<HkdfRegion, number>>,
  run: HkdfRun,
): RegionSpec<HkdfRegion>[] {
  // A given PRK (expand modes) is an input, not a placeholder.
  const blankIds = BLANK.filter((id) => id !== 'prk' || extracts(run.mode));
  return u8Regions<HkdfRegion>(NS, sizes as Record<HkdfRegion, number>, blankIds);
}

/** Zeros, except the inputs the run already knows (the Extract salt is `extractSalt`'s). */
function initialSnapshot(
  run: HkdfRun,
  salt: number[],
  regions: readonly RegionSpec<HkdfRegion>[],
): Snapshot<HkdfRegion> {
  const zeros = zeroSnapshot(regions);
  const known: Partial<Record<HkdfRegion, number[]>> = {
    ikm: run.ikm,
    salt,
    info: run.info,
    ...(extracts(run.mode) ? {} : { prk: run.prk }),
  };
  const present = Object.entries(known).filter(([id]) => id in zeros);
  return { ...zeros, ...Object.fromEntries(present) };
}

/** Narration of the initial state, per mode. */
export function initialNarration(run: HkdfRun): I18nRef {
  const hashLen = run.mac.outputSize;
  const common = { mac: macDisplayName(run.mac), hashLen };
  switch (run.mode) {
    case 'hkdf':
      return i18nRef(`${NS}.step.initial.hkdf`, {
        ...common,
        ikmBytes: run.ikm.length,
        length: run.length,
        blocks: blockCount(run.length, hashLen),
      });
    case 'extract':
      return i18nRef(`${NS}.step.initial.extract`, { ...common, ikmBytes: run.ikm.length });
    case 'expand':
      return i18nRef(`${NS}.step.initial.expand`, {
        ...common,
        prkBytes: run.prk.length,
        length: run.length,
        blocks: blockCount(run.length, hashLen),
      });
    case 'expand-label':
      return i18nRef(`${NS}.step.initial.expandLabel`, {
        ...common,
        label: run.label,
        length: run.length,
        blocks: blockCount(run.length, hashLen),
      });
  }
}

const has = (sizes: Partial<Record<HkdfRegion, number>>, region: HkdfRegion) =>
  sizes[region] !== undefined;
const whole = (
  sizes: Partial<Record<HkdfRegion, number>>,
  region: HkdfRegion,
  kind: Highlight<HkdfRegion>['kind'],
) => (has(sizes, region) ? [highlight(region, kind, allIndices(sizes[region]!))] : []);

function recordLabel(
  tracer: Tracer,
  run: HkdfRun,
  struct: HkdfLabelStruct,
): HkdfLabelStruct & { step: number } {
  tracer.step({
    op: 'hkdfLabel',
    writes: [{ region: 'hkdfLabel', offset: 0, values: struct.bytes }],
    highlights: [highlight('hkdfLabel', 'write', allIndices(struct.bytes.length))],
    narration: i18nRef(`${NS}.step.hkdfLabel`, {
      length: run.length,
      lengthHex: toHex(struct.bytes.slice(0, 2)),
      labelLength: struct.fullLabel.length,
      label: run.label,
      contextLength: struct.context.length,
      context: struct.context.length === 0 ? '—' : toHex(struct.context),
      bytes: toHex(struct.bytes),
    }),
  });
  return { ...struct, step: tracer.stepCount - 1 };
}

function recordExtract(
  tracer: Tracer,
  run: HkdfRun,
  sizes: Partial<Record<HkdfRegion, number>>,
): number[] {
  const prk = hkdfExtract(run.mac, run.salt, run.ikm);
  const common = { mac: macDisplayName(run.mac), ikmBytes: run.ikm.length, prk: toHex(prk) };
  tracer.step({
    op: 'extract',
    writes: [{ region: 'prk', offset: 0, values: prk }],
    highlights: [
      ...whole(sizes, 'salt', 'read'),
      ...whole(sizes, 'ikm', 'read'),
      ...whole(sizes, 'prk', 'write'),
    ],
    narration:
      run.salt.length === 0
        ? i18nRef(`${NS}.step.extractZeroSalt`, { ...common, hashLen: run.mac.outputSize })
        : i18nRef(`${NS}.step.extract`, { ...common, saltBytes: run.salt.length }),
  });
  return prk;
}

/** Reads of Expand block i: PRK, T(i−1) (from block 2 on) and the info (or HkdfLabel). */
function expandReads(
  run: HkdfRun,
  index: number,
  sizes: Partial<Record<HkdfRegion, number>>,
): Highlight<HkdfRegion>[] {
  const infoRegion: HkdfRegion = run.mode === 'expand-label' ? 'hkdfLabel' : 'info';
  const previous =
    index > 1 ? [highlight<HkdfRegion>('t', 'read', allIndices(run.mac.outputSize))] : [];
  return [...whole(sizes, 'prk', 'read'), ...previous, ...whole(sizes, infoRegion, 'read')];
}

function expandNarration(run: HkdfRun, block: ExpandBlock): I18nRef {
  const params = {
    n: block.index,
    counter: toHex([block.index]),
    mac: macDisplayName(run.mac),
    t: toHex(block.t),
  };
  return block.index === 1
    ? i18nRef(`${NS}.step.expandFirst`, params)
    : i18nRef(`${NS}.step.expand`, { ...params, prev: block.index - 1 });
}

/** One step per block: T(i) into `t`, and its part of the first L bytes into `okm`. */
function recordExpand(
  tracer: Tracer,
  run: HkdfRun,
  prk: number[],
  info: number[],
  sizes: Partial<Record<HkdfRegion, number>>,
): RecordedBlock[] {
  const hashLen = run.mac.outputSize;
  return hkdfExpandBlocks(run.mac, prk, info, run.length).map((block) => {
    const offset = (block.index - 1) * hashLen;
    const okmPart = block.t.slice(0, Math.max(0, run.length - offset));
    tracer.step({
      op: 'expand',
      writes: [
        { region: 't', offset: 0, values: block.t },
        { region: 'okm', offset, values: okmPart },
      ],
      highlights: [
        ...expandReads(run, block.index, sizes),
        highlight('t', 'write', allIndices(hashLen)),
        highlight(
          'okm',
          'write',
          okmPart.map((_, index) => offset + index),
        ),
      ],
      narration: expandNarration(run, block),
    });
    return { ...block, step: tracer.stepCount - 1 };
  });
}

function recordOutput(tracer: Tracer, run: HkdfRun, blocks: readonly RecordedBlock[]): number[] {
  const okm = okmOf(blocks, run.length);
  const dropped = blocks.length * run.mac.outputSize - run.length;
  const params = { length: run.length, blocks: blocks.length, okm: toHex(okm) };
  tracer.step({
    op: 'output',
    writes: [],
    highlights: [highlight('okm', 'read', allIndices(run.length))],
    narration:
      dropped === 0
        ? i18nRef(`${NS}.step.output`, params)
        : i18nRef(`${NS}.step.outputTruncated`, { ...params, dropped }),
  });
  return okm;
}

/** Records the mode's steps; the module checks the results against the untraced functions. */
export function recordHkdf(run: HkdfRun): HkdfRecording {
  const salt = extractSalt(run.salt, run.mac.outputSize);
  const labelStruct =
    run.mode === 'expand-label' ? hkdfLabel(run.length, run.label, run.context) : undefined;
  const sizes = regionSizes(run, salt.length, labelStruct?.bytes.length ?? 0);
  const regions = regionSpecs(sizes, run);
  const tracer: Tracer = new RecordingTracer(regions, initialSnapshot(run, salt, regions), {
    initialNarration: initialNarration(run),
  });
  const label = labelStruct === undefined ? undefined : recordLabel(tracer, run, labelStruct);
  const prk = extracts(run.mode) ? recordExtract(tracer, run, sizes) : run.prk;
  const prkStep = extracts(run.mode) ? tracer.stepCount - 1 : -1;
  const info = label?.bytes ?? run.info;
  const blocks = expands(run.mode) ? recordExpand(tracer, run, prk, info, sizes) : [];
  const okm = expands(run.mode) ? recordOutput(tracer, run, blocks) : [];
  return {
    state: tracer.toFacet(),
    salt,
    prk,
    prkStep,
    info,
    ...(label === undefined ? {} : { label }),
    blocks,
    okm,
    okmStep: tracer.stepCount - 1,
  };
}
