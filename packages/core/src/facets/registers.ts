import type { I18nRef } from '../i18n.ts';
import { alignShapeIssues, type AlignSpan } from './align.ts';
import { isIndex } from './validation.ts';

/**
 * Registers facet: the register file a listing uses and the writes to it, each aligned to the
 * state steps it covers (docs/M4.md §1e, §3c). Core hardcodes no register names or lanes.
 */

export interface RegisterSpec {
  name: string;
  bits: number;
  /** Lane widths offered, e.g. [8, 32, 64]. */
  lanes: number[];
}

export interface RegisterFileSpec {
  isa: string;
  byteOrder: 'little' | 'big';
  /** Only the registers the listing uses. */
  registers: RegisterSpec[];
}

export interface RegisterWrite {
  reg: string;
  /** Memory order: byte 0 = lowest address. */
  bytes: number[];
  valueRef?: string;
}

export interface RegisterStep {
  align: AlignSpan;
  writes: RegisterWrite[];
}

export interface RegistersFacet {
  kind: 'registers';
  schemaVersion: 1;
  label: I18nRef;
  file: RegisterFileSpec;
  /** Monotonic `align` spans. */
  steps: RegisterStep[];
}

function registerSpecIssues(spec: RegisterSpec): string[] {
  const where = `registers: register "${spec.name}"`;
  if (!Number.isInteger(spec.bits) || spec.bits <= 0 || spec.bits % 8 !== 0) return [`${where}: bits ${spec.bits} is not a positive multiple of 8`];
  return spec.lanes
    .filter((lane) => !Number.isInteger(lane) || lane <= 0 || spec.bits % lane !== 0)
    .map((lane) => `${where}: lane width ${lane} does not divide ${spec.bits}`);
}

function fileIssues(file: RegisterFileSpec): string[] {
  const seen = new Set<string>();
  const issues: string[] = [];
  for (const spec of file.registers) {
    if (seen.has(spec.name)) issues.push(`registers: duplicate register "${spec.name}"`);
    seen.add(spec.name);
    issues.push(...registerSpecIssues(spec));
  }
  return issues;
}

function writeIssues(write: RegisterWrite, specByName: Map<string, RegisterSpec>, where: string): string[] {
  const spec = specByName.get(write.reg);
  if (spec === undefined) return [`${where}: unknown register "${write.reg}"`];
  const issues = write.bytes.filter((byte) => !isIndex(byte, 256)).map((byte) => `${where}: ${byte} is not a byte`);
  if (write.bytes.length * 8 !== spec.bits) issues.push(`${where}: ${write.bytes.length} bytes for ${spec.bits}-bit "${spec.name}"`);
  return issues;
}

/** Schema problems of a registers facet (empty = valid): register file, writes to known registers at full width, monotonic spans. */
export function validateRegistersFacet(facet: RegistersFacet): string[] {
  const specByName = new Map(facet.file.registers.map((spec) => [spec.name, spec]));
  const stepIssues = facet.steps.flatMap((step, index) => step.writes.flatMap((write) => writeIssues(write, specByName, `registers: step ${index}`)));
  return [
    ...fileIssues(facet.file),
    ...stepIssues,
    ...alignShapeIssues(
      facet.steps.map((step) => step.align),
      'registers',
    ),
  ];
}

/**
 * Register contents at playhead `p`: replays, in order, the steps whose effects are visible
 * (`align.last ≤ p`). Every register of the file is present; `undefined` = never written.
 */
export function registersAt(facet: RegistersFacet, p: number): Map<string, number[] | undefined> {
  const contents = new Map<string, number[] | undefined>(facet.file.registers.map((spec) => [spec.name, undefined]));
  for (const step of facet.steps) {
    if (step.align.last > p) continue;
    for (const write of step.writes) contents.set(write.reg, write.bytes);
  }
  return contents;
}
