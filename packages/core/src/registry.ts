import type { I18nRef } from './i18n.ts';
import type { ChoreographyModule } from './choreography.ts';
import type { ParamField } from './params.ts';
import type { PortResolver } from './plugin/ports.ts';
import type { PortMap, PortName } from './ports.ts';
import type { FacetKey, FacetKind, TraceBundle } from './trace.ts';
import type { Tracer } from './tracer.ts';

export type RunResult = { ok: true; trace: TraceBundle } | { ok: false; error: I18nRef };

export type ValidationResult<P> = { ok: true; value: P } | { ok: false; error: I18nRef };

export interface RunOptions {
  tracer?: Tracer<string, { op: string }>;
  /** Resolves the ports named by `port` params (from `preparePorts`); see `requirePort`. */
  resolve?: PortResolver;
}

export interface PrimitiveModule<P> {
  run(params: P, options?: RunOptions): RunResult;
  /** Every port the manifest `implements`, for other producers to use via `resolve`. */
  ports?: Partial<PortMap>;
}

/** Where the web host runs a producer: on the main thread (default) or in a module Web Worker. */
export type RunIn = 'main' | 'worker';

export interface Preset<P> {
  id: string;
  labelKey: string;
  params: P;
}

/** Producer-declared labels of one op (`StateStep.op`): debugger pickers use `labelKey`, tight spots `shortLabelKey`. */
export interface OpLabels {
  labelKey: string;
  /** Compact name for the player's scope path ("Round 1 · SubBytes"); falls back to `labelKey`. */
  shortLabelKey?: string;
}

/** Producer-declared label of one `TraceBundle.output` entry. */
export interface OutputLabel {
  labelKey: string;
}

export interface PrimitiveManifest<P = unknown> {
  kind: 'primitive';
  id: string;
  apiVersion: 1;
  family: string;
  /** Ports the module exposes in `PrimitiveModule.ports`. */
  implements: PortName[];
  /** Optional (additive): `'worker'` runs the producer in a Web Worker; default `'main'`. */
  runIn?: RunIn;
  titleKey: string;
  refs: string[];
  facets: FacetKind[];
  presets: Preset<P>[];
  defaults: P;
  i18nNamespace: string;
  /**
   * Optional input description for generic param panels (additive, apiVersion stays 1).
   * Without it, string defaults named `…Hex` become hex fields labelled `<ns>.param.<name>`.
   */
  paramFields?: ParamField[];
  /**
   * Optional op labels keyed by `StateStep.op` (additive); the only source of op labels. Ops
   * without an entry are shown by their raw name.
   */
  ops?: Record<string, OpLabels>;
  /** Optional labels keyed by `TraceBundle.output` name (additive), e.g. `{ ciphertext: { labelKey } }`. */
  outputs?: Record<string, OutputLabel>;
  /** Schema-library agnostic param validation. */
  validate(params: unknown): ValidationResult<P>;
  load: () => Promise<PrimitiveModule<P>>;
  /** Optional step choreography (animations); views fall back to `fallbackChoreography` without it. */
  loadChoreography?: () => Promise<ChoreographyModule>;
  /**
   * Optional (additive): params of this producer's own lab encrypting one block (aes:
   * `{ keyHex, plaintextHex: blockHex, detail: 'op' }`). The mode views "zoom" into that lab; without it, they don't.
   */
  blockLabParams?(keyHex: string, blockHex: string): Record<string, string>;
}

export type Lens = 'story' | 'engineer' | 'cryptographer';
export type ViewSlot = 'main' | 'side' | 'bottom';
/** Where a view goes on narrow screens: its normal panel, or replaced by the lab caption. */
export type NarrowPlacement = 'panel' | 'caption';

/** `C` is the component type; kept generic so core has no React dependency. */
export interface ViewManifest<C = unknown> {
  kind: 'view';
  id: string;
  apiVersion: 1;
  titleKey: string;
  icon: string;
  requires: FacetKind[];
  optional?: FacetKind[];
  lenses?: Lens[];
  defaultSlot?: ViewSlot;
  order?: number;
  /** Optional (additive): `'caption'` = on narrow screens the lab caption replaces this view; default `'panel'`. */
  narrowPlacement?: NarrowPlacement;
  load: () => Promise<{ default: C }>;
}

export interface DeriverModule {
  derive(bundle: TraceBundle): Partial<Record<FacetKey, unknown>>;
}

export interface DeriverManifest {
  kind: 'deriver';
  id: string;
  apiVersion: 1;
  from: FacetKind[];
  provides: FacetKind[];
  appliesTo?: (bundle: TraceBundle) => boolean;
  load: () => Promise<DeriverModule>;
}

export type AnyManifest = PrimitiveManifest | ViewManifest | DeriverManifest;

/** Id-keyed registry; duplicate ids are a programming error and throw. */
export class Registry<M extends { id: string }> {
  private readonly entries = new Map<string, M>();

  constructor(private readonly name: string = 'registry') {}

  register(manifest: M): M {
    if (this.entries.has(manifest.id)) {
      throw new Error(`${this.name}: duplicate id "${manifest.id}" is already registered`);
    }
    this.entries.set(manifest.id, manifest);
    return manifest;
  }

  get(id: string): M | undefined {
    return this.entries.get(id);
  }

  require(id: string): M {
    const manifest = this.entries.get(id);
    if (manifest === undefined) throw new Error(`${this.name}: no entry with id "${id}"`);
    return manifest;
  }

  list(): M[] {
    return [...this.entries.values()];
  }
}

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Throws when a manifest breaks the basic invariants shared by all plugin kinds. */
export function assertManifestBasics(manifest: { kind: string; id: string; apiVersion: number }): void {
  if (!KEBAB_CASE.test(manifest.id)) {
    throw new Error(`${manifest.kind} manifest: id "${manifest.id}" must be non-empty kebab-case`);
  }
  if (manifest.apiVersion !== 1) {
    throw new Error(`${manifest.kind} "${manifest.id}": unsupported apiVersion ${manifest.apiVersion} (expected 1)`);
  }
}

export function definePrimitive<P>(manifest: PrimitiveManifest<P>): PrimitiveManifest<P> {
  assertManifestBasics(manifest);
  return manifest;
}

export function defineView<C>(manifest: ViewManifest<C>): ViewManifest<C> {
  assertManifestBasics(manifest);
  return manifest;
}

export function defineDeriver(manifest: DeriverManifest): DeriverManifest {
  assertManifestBasics(manifest);
  return manifest;
}

function isSubset(items: readonly FacetKind[], of: ReadonlySet<FacetKind>): boolean {
  return items.every((item) => of.has(item));
}

/** Available kinds plus everything ONE deriver hop away (derivers whose `from` ⊆ available). */
export function reachableFacetKinds(
  available: readonly FacetKind[],
  derivers: readonly DeriverManifest[],
): Set<FacetKind> {
  const direct = new Set(available);
  const reachable = new Set(available);
  for (const deriver of derivers) {
    if (isSubset(deriver.from, direct)) deriver.provides.forEach((kind) => reachable.add(kind));
  }
  return reachable;
}

/** Sort comparator by `id` (code-unit order, locale independent). */
export function compareById(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The one view order: `order` ascending (unset last), then id. Prefer `viewsFor`, which applies it. */
export function compareViews(a: Pick<ViewManifest<unknown>, 'id' | 'order'>, b: Pick<ViewManifest<unknown>, 'id' | 'order'>): number {
  const orderA = a.order ?? Number.POSITIVE_INFINITY;
  const orderB = b.order ?? Number.POSITIVE_INFINITY;
  if (orderA !== orderB) return orderA < orderB ? -1 : 1;
  return compareById(a, b);
}

/**
 * Views whose `requires` are satisfiable directly or via one deriver hop, sorted by
 * `order` (unset last) then id. `appliesTo` needs a bundle and is checked at derive time.
 */
export function viewsFor<C>(
  views: readonly ViewManifest<C>[],
  available: readonly FacetKind[],
  derivers: readonly DeriverManifest[] = [],
): ViewManifest<C>[] {
  const reachable = reachableFacetKinds(available, derivers);
  return views.filter((view) => isSubset(view.requires, reachable)).sort(compareViews);
}
