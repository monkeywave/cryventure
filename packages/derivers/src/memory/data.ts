import type { LayoutField, StructLayout, TargetSpec } from '@cryventure/core';
import implsJson from './data/impls.json';
import aarch64Layout from './data/layouts/aes_key.aarch64-linux-gnu.json';
import x86_64Layout from './data/layouts/aes_key.x86_64-linux-gnu.json';
import targetsJson from './data/targets.json';

/**
 * Typed access to the memory deriver's data files (docs/M4.md §4): targets, AES implementations
 * and the generated `AES_KEY` layouts. All facts are sourced in `data/SOURCES.md`.
 */

export type RdKeyEncoding = 'host-endian-u32' | 'raw-bytes';

/** One `AES_set_encrypt_key` implementation (`data/impls.json`). */
export interface ImplSpec {
  id: string;
  triples: string[];
  rdKeyEncoding: RdKeyEncoding;
  /** Value stored in `AES_KEY.rounds`, by key size in bits ("128" | "192" | "256"). */
  rounds: Record<string, number>;
  source: StructLayout['source'];
}

/** A target plus the modeled stack conventions (`data/targets.json`). */
export interface TargetData extends TargetSpec {
  stack: { provenance: 'modeled'; frameBase: string; growsDown: boolean; frameAlign: number };
}

/** A generated `AES_KEY` layout before it is bound to an implementation (no `impl`, no encodings). */
export type RawLayout = Omit<StructLayout, 'impl'>;

export const TARGETS: readonly TargetData[] = targetsJson as TargetData[];
export const IMPLS: readonly ImplSpec[] = implsJson as ImplSpec[];
const LAYOUTS: readonly RawLayout[] = [x86_64Layout as RawLayout, aarch64Layout as RawLayout];

/** The generated `AES_KEY` layout of `triple`; throws when none is committed. */
export function aesKeyLayoutFor(triple: string): RawLayout {
  const layout = LAYOUTS.find((candidate) => candidate.triple === triple);
  if (layout === undefined) throw new Error(`memory: no AES_KEY layout for triple "${triple}"`);
  return layout;
}

function fieldEncoding(field: LayoutField, impl: ImplSpec): LayoutField['encoding'] {
  if (field.name === 'rd_key') return impl.rdKeyEncoding;
  return field.type === 'int' ? 'int' : field.encoding;
}

/**
 * The layout as one implementation fills it: `impl` set, `rd_key` encoded as the impl stores it,
 * `rounds` as `int`. Only the `StructLayout` fields are kept (the compiler record stays in the data file).
 */
export function bindLayout(layout: RawLayout, impl: ImplSpec): StructLayout {
  const fields = layout.fields.map((field) => {
    const encoding = fieldEncoding(field, impl);
    return encoding === undefined ? { ...field } : { ...field, encoding };
  });
  const { name, triple, size, align, source } = layout;
  return { name, impl: impl.id, triple, size, align, source: { ...source }, fields };
}

/** Every (target, impl) pair, targets in data order (x86_64 first), impls in data order per target. */
export function targetImplPairs(): { target: TargetData; impl: ImplSpec }[] {
  return TARGETS.flatMap((target) => IMPLS.filter((impl) => impl.triples.includes(target.triple)).map((impl) => ({ target, impl })));
}

/** The plain `TargetSpec` part of a target (without the modeled stack conventions). */
export function targetSpec({ triple, dataModel, ptrSize, endian }: TargetData): TargetSpec {
  return { triple, dataModel, ptrSize, endian };
}
