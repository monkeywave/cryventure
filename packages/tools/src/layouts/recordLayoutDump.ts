/**
 * Parser for clang's `-Xclang -fdump-record-layouts` text output. Only the top-level fields of each
 * record are kept (nested records are laid out in their own dump blocks); bitfields are rejected
 * because the memory facet has no bit-granular fields.
 */

export interface DumpedField {
  name: string;
  offset: number;
  /** C type as clang prints it, e.g. `unsigned int[60]`. */
  type: string;
}

export interface DumpedRecord {
  /** Record name without the `struct`/`union` keyword. */
  name: string;
  size: number;
  align: number;
  fields: DumpedField[];
}

const BLOCK_HEADER = '*** Dumping AST Record Layout';
const ROW = /^\s*(\S*) \| (\s*)(.*)$/;
const RECORD_HEADER = /^(?:struct|union|class) (\S+)$/;
const SIZE_ALIGN = /^\[sizeof=(\d+), (?:dsize=\d+, )?align=(\d+)/;
const FIELD = /^(.+) (\w+)$/;
const ARRAY_TYPE = /^(.*)\[(\d+)\]$/;
/** Indentation clang uses for each nesting level after the `|` separator. */
const TOP_LEVEL_FIELD_INDENT = 2;

export function parseRecordLayoutDump(dump: string): DumpedRecord[] {
  return dump
    .split(BLOCK_HEADER)
    .slice(1)
    .map((block) => parseBlock(block.split('\n').filter((line) => line.trim() !== '')));
}

function parseBlock(lines: readonly string[]): DumpedRecord {
  const rows = lines.map(parseRow);
  const header = rows[0]?.text.match(RECORD_HEADER);
  const footer = rows.at(-1)?.text.match(SIZE_ALIGN);
  if (!header?.[1] || !footer?.[1] || !footer[2])
    throw new Error(`unrecognised record layout block:\n${lines.join('\n')}`);
  const fields = rows
    .slice(1, -1)
    .filter((row) => row.indent === TOP_LEVEL_FIELD_INDENT)
    .map(parseField);
  return { name: header[1], size: Number(footer[1]), align: Number(footer[2]), fields };
}

interface DumpRow {
  offset: string;
  indent: number;
  text: string;
}

function parseRow(line: string): DumpRow {
  const match = line.match(ROW);
  if (!match) throw new Error(`unrecognised record layout line: ${line}`);
  return { offset: match[1] ?? '', indent: (match[2] ?? '').length, text: (match[3] ?? '').trim() };
}

function parseField(row: DumpRow): DumpedField {
  if (!/^\d+$/.test(row.offset))
    throw new Error(`unsupported field offset (bitfield?): ${row.offset} | ${row.text}`);
  const match = row.text.match(FIELD);
  if (!match?.[1] || !match[2]) throw new Error(`unrecognised field: ${row.text}`);
  return { name: match[2], offset: Number(row.offset), type: match[1] };
}

/** `unsigned int[60]` → `{ elemType: 'unsigned int', count: 60 }`; undefined for non-array types. */
export function parseArrayType(type: string): { elemType: string; count: number } | undefined {
  const match = type.match(ARRAY_TYPE);
  return match?.[1] && match[2]
    ? { elemType: match[1].trim(), count: Number(match[2]) }
    : undefined;
}
