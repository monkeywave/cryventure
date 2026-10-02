import type { I18nRef } from '../i18n.ts';
import { isIndex } from './validation.ts';

/** Table facet: a lookup table (e.g. the AES S-box) with an optional selection and marked cells (docs/M2.md §2). */

export type TableMarkRole = 'input' | 'output' | 'fixed-point' | 'opposite-fixed-point';

export interface TableMark {
  index: number;
  role: TableMarkRole;
  label?: I18nRef;
}

export interface TableFacet {
  kind: 'table';
  schemaVersion: 1;
  title: I18nRef;
  rows: number;
  cols: number;
  /** Row-major, `entries.length === rows * cols`, each a u8. */
  entries: number[];
  /** Highlighted input index. */
  selected?: number;
  /** Producer param that receives a clicked index (2-digit hex for a 256-entry table). */
  selectParam?: string;
  marks?: TableMark[];
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function shapeProblems(facet: TableFacet): string[] {
  const { rows, cols, entries } = facet;
  if (!isPositiveInteger(rows) || !isPositiveInteger(cols)) return [`table: shape ${rows}×${cols} is not positive integers`];
  return entries.length === rows * cols ? [] : [`table: ${entries.length} entries for a ${rows}×${cols} table`];
}

function indexProblems(facet: TableFacet): string[] {
  const size = facet.entries.length;
  const problems: string[] = [];
  if (facet.selected !== undefined && !isIndex(facet.selected, size)) problems.push(`table: selected ${facet.selected} outside 0..${size - 1}`);
  for (const mark of facet.marks ?? []) if (!isIndex(mark.index, size)) problems.push(`table: ${mark.role} mark ${mark.index} outside 0..${size - 1}`);
  if (facet.selectParam === '') problems.push('table: selectParam is empty');
  return problems;
}

/** Schema problems of a table facet (empty = valid): shape, u8 entries, in-range selection and marks. */
export function validateTableFacet(facet: TableFacet): string[] {
  const entries = facet.entries.flatMap((entry, index) => (isIndex(entry, 256) ? [] : [`table: entry ${index} = ${entry} is not a u8`]));
  return [...shapeProblems(facet), ...entries, ...indexProblems(facet)];
}

/** Throws the first `validateTableFacet` problem. */
export function assertValidTableFacet(facet: TableFacet): void {
  const [problem] = validateTableFacet(facet);
  if (problem !== undefined) throw new Error(problem);
}
