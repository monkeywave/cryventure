import {
  i18nRef,
  mathTerm,
  PairedRecorder,
  type I18nRef,
  type MathTerm,
  type MathTermOptions,
  type MathTermRole,
  type RegionSpec,
  type ScopeLevel,
  type StateFacet,
} from '@cryventure/core';
import type { Gf256StepOp } from './manifest.ts';

/**
 * Shared trace vocabulary of the gf256 producer: one-element regions, term builders and a recorder
 * (core's `PairedRecorder`) that emits each state step together with its math step at the same index.
 */
export type Gf256Region = 'a' | 'b' | 'shifted' | 'addend' | 'acc' | 'power' | 'result';
export type Gf256Op = { op: Gf256StepOp };
export type Gf256StateFacet = StateFacet<Gf256Region, Gf256Op>;
export type Gf256Recorder = PairedRecorder<Gf256Region, Gf256Op>;

export const NS = 'plugin.gf256';

/**
 * Spec of a single-element region; `shifted` is u16 because it holds the unreduced 9-bit value.
 * Every region starts blank (its initial 0 is a placeholder until a step writes it).
 */
export function regionSpec(id: Gf256Region): RegionSpec<Gf256Region> {
  return { id, labelKey: `${NS}.region.${id}`, elem: id === 'shifted' ? 'u16' : 'u8', shape: [1], layout: { kind: 'grid' }, initial: 'blank' };
}

export function scopeLevels(...levels: string[]): ScopeLevel[] {
  return levels.map((level) => ({
    labelKey: `${NS}.scope.${level}`,
    nextKey: `${NS}.scope.${level}Next`,
    prevKey: `${NS}.scope.${level}Prev`,
  }));
}

/** A recorder over `regions` (all zero placeholders) with the given scope levels. */
export function gf256Recorder(regions: readonly Gf256Region[], levels: ScopeLevel[]): Gf256Recorder {
  const initial = Object.fromEntries(regions.map((region) => [region, [0]])) as unknown as Record<Gf256Region, number[]>;
  return new PairedRecorder<Gf256Region, Gf256Op>(regions.map(regionSpec), initial, levels);
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
  return Array.from({ length: width }, (_, bit) => bit).filter((bit) => (value >> bit) & 1);
}
