import {
  bitOf,
  i18nRef,
  mathTerm,
  PairedRecorder,
  scopeLevels,
  singleCellRegion,
  type I18nRef,
  type InitialContent,
  type MathTerm,
  type MathTermOptions,
  type MathTermRole,
  type Snapshot,
  type StateFacet,
} from '@cryventure/core';
import type { Gf256StepOp } from './manifest.ts';

/**
 * Shared trace vocabulary of the gf256 producer: one-element regions, term builders and a recorder
 * (core's `PairedRecorder`) that emits each state step together with its math step at the same index.
 * The operands are not a step: they are in the initial state, narrated at step −1 (docs/M3.md §0a).
 */
export type Gf256Region = 'a' | 'b' | 'shifted' | 'addend' | 'acc' | 'power' | 'result';
export type Gf256Op = { op: Gf256StepOp };
export type Gf256StateFacet = StateFacet<Gf256Region, Gf256Op>;
export type Gf256Recorder = PairedRecorder<Gf256Region, Gf256Op>;

export const NS = 'plugin.gf256';

/** The operands of a run, as the initial state holds them (step −1), with their narration and math. */
export interface Gf256Initial extends InitialContent {
  values: Partial<Record<Gf256Region, number>>;
}

/**
 * A recorder over one-element `regions` with scope levels `<ns>.scope.<level>`. Regions listed in
 * `initial.values` start with that value; every other region starts blank (its initial 0 is a
 * placeholder until a step writes it). `shifted` is u16 because it holds the unreduced 9-bit value.
 */
export function gf256Recorder(regions: readonly Gf256Region[], initial: Gf256Initial, ...levels: string[]): Gf256Recorder {
  const { values, ...content } = initial;
  const specs = regions.map((id) => singleCellRegion(NS, id, { elem: id === 'shifted' ? 'u16' : 'u8', blank: values[id] === undefined }));
  const snapshot = Object.fromEntries(regions.map((id) => [id, [values[id] ?? 0]])) as unknown as Snapshot<Gf256Region>;
  return new PairedRecorder<Gf256Region, Gf256Op>(specs, snapshot, scopeLevels(NS, ...levels), content);
}

export function write(region: Gf256Region, value: number) {
  return { region, offset: 0, values: [value] };
}

interface TermOptions extends MathTermOptions {
  label?: I18nRef;
}

/** A math term labelled `plugin.gf256.term.<id>` unless `options.label` overrides it. */
export function term(id: string, value: number, width: number, role: MathTermRole, options: TermOptions = {}): MathTerm {
  const { label = i18nRef(`${NS}.term.${id}`), ...rest } = options;
  return mathTerm(id, label, value, width, role, rest);
}

/** Set bit positions of `value` (0 = LSB). */
export function setBits(value: number, width = 8): number[] {
  return Array.from({ length: width }, (_, bit) => bit).filter((bit) => bitOf(value, bit) === 1);
}
