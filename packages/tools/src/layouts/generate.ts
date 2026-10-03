import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilerVersion, pinnedLlvm, runCommand, type CommandRunner } from '../asm/llvm.ts';
import { isEntryPoint } from '../fs/entryPoint.ts';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import {
  type DumpedField,
  type DumpedRecord,
  parseArrayType,
  parseRecordLayoutDump,
} from './recordLayoutDump.ts';

/**
 * `pnpm layouts:generate` (dev-only, needs clang; CI only checks the committed JSON): lays out
 * OpenSSL's `struct aes_key_st` for every target triple in `targets.json` with
 * `clang -target <triple> -Xclang -fdump-record-layouts` and writes
 * `packages/derivers/src/memory/data/layouts/aes_key.<triple>.json` (docs/M4.md §3d, §4).
 * Uses the same pinned LLVM as `asm:generate` (`asm/llvm.ts`; `CLANG` still overrides the binary).
 */

export interface SourceRef {
  lib: string;
  version: string;
  path: string;
  line: number;
}

export interface CompilerInfo {
  version: string;
  args: string[];
}

export interface GeneratedField {
  name: string;
  offset: number;
  size: number;
  type: string;
  count?: number;
  elemSize?: number;
}

/** The impl-independent part of `StructLayout` (§3d); the memory deriver adds `impl` when it binds. */
export interface GeneratedLayout {
  name: string;
  triple: string;
  size: number;
  align: number;
  source: SourceRef;
  compiler: CompilerInfo;
  fields: GeneratedField[];
}

/** Where `struct aes_key_st` is defined at the pinned tag (see packages/derivers/src/memory/data/SOURCES.md). */
export const AES_KEY_SOURCE: SourceRef = {
  lib: 'OpenSSL',
  version: 'openssl-3.5.9',
  path: 'include/openssl/aes.h',
  line: 36,
};
export const AES_KEY_RECORD = 'aes_key_st';

const C_SOURCE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'aes_key.c');
const DATA_DIR = join(REPO_ROOT, 'packages/derivers/src/memory/data');

export function clangArgs(triple: string): string[] {
  return ['-target', triple, '-Xclang', '-fdump-record-layouts', '-fsyntax-only', '-x', 'c', '-'];
}

/** C struct name of the probe record that measures `field` (whole field, or one array element). */
export function probeRecordName(field: string, part: 'size' | 'elem'): string {
  return `cv_${part}_${field}`;
}

/**
 * Appends one probe record per field (and per array element type) to `cSource`, so the second
 * dump also reports each field's size — the layout dump itself only prints offsets.
 */
export function probeSource(cSource: string, record: DumpedRecord): string {
  const probes = record.fields.flatMap((field) => {
    const access = `((struct ${record.name} *)0)->${field.name}`;
    const parts: [string, string][] = [[probeRecordName(field.name, 'size'), access]];
    if (parseArrayType(field.type))
      parts.push([probeRecordName(field.name, 'elem'), `${access}[0]`]);
    return parts.map(
      ([probe, expr]) =>
        `struct ${probe} { __typeof__(${expr}) v; };\nint ${probe}_use[sizeof(struct ${probe})];`,
    );
  });
  return `${cSource}\n${probes.join('\n')}\n`;
}

function findRecord(records: readonly DumpedRecord[], name: string): DumpedRecord {
  const record = records.find((candidate) => candidate.name === name);
  if (!record) throw new Error(`record ${name} not found in the layout dump`);
  return record;
}

function toGeneratedField(field: DumpedField, probes: readonly DumpedRecord[]): GeneratedField {
  const size = findRecord(probes, probeRecordName(field.name, 'size')).size;
  const array = parseArrayType(field.type);
  if (!array) return { name: field.name, offset: field.offset, size, type: field.type };
  const elemSize = findRecord(probes, probeRecordName(field.name, 'elem')).size;
  return {
    name: field.name,
    offset: field.offset,
    size,
    type: field.type,
    count: array.count,
    elemSize,
  };
}

/** Combines the record dump with its probe dump into the committed layout shape. */
export function buildLayout(input: {
  recordName: string;
  triple: string;
  dump: DumpedRecord[];
  probeDump: DumpedRecord[];
  source: SourceRef;
  compiler: CompilerInfo;
}): GeneratedLayout {
  const record = findRecord(input.dump, input.recordName);
  return {
    name: record.name,
    triple: input.triple,
    size: record.size,
    align: record.align,
    source: input.source,
    compiler: input.compiler,
    fields: record.fields.map((field) => toGeneratedField(field, input.probeDump)),
  };
}

/** Lays out `struct aes_key_st` for `triple` with `clang` (run through `run`, injectable for tests). */
export function generateLayout(
  triple: string,
  cSource: string,
  { clang = pinnedLlvm().clang, run = runCommand }: { clang?: string; run?: CommandRunner } = {},
): GeneratedLayout {
  const args = clangArgs(triple);
  const dump = parseRecordLayoutDump(run(clang, args, cSource));
  const probeDump = parseRecordLayoutDump(
    run(clang, args, probeSource(cSource, findRecord(dump, AES_KEY_RECORD))),
  );
  const version = compilerVersion(run, clang) || 'unknown';
  return buildLayout({
    recordName: AES_KEY_RECORD,
    triple,
    dump,
    probeDump,
    source: AES_KEY_SOURCE,
    compiler: { version, args: args.slice(0, -1) },
  });
}

function readTriples(): string[] {
  const targets = JSON.parse(readFileSync(join(DATA_DIR, 'targets.json'), 'utf8')) as {
    triple: string;
  }[];
  return targets.map((target) => target.triple);
}

if (isEntryPoint(import.meta.url)) {
  const cSource = readFileSync(C_SOURCE_PATH, 'utf8');
  mkdirSync(join(DATA_DIR, 'layouts'), { recursive: true });
  for (const triple of readTriples()) {
    const layout = generateLayout(triple, cSource);
    const outPath = join(DATA_DIR, 'layouts', `aes_key.${triple}.json`);
    writeFileSync(outPath, `${JSON.stringify(layout, null, 2)}\n`);
    console.log(`wrote ${outPath}  size=${layout.size} align=${layout.align}`);
  }
}
