/**
 * Pure parsers for compiler assembly (`clang -S`) and disassembly (`llvm-objdump -d --no-show-raw-insn`).
 * Dev-only: used by `generate.ts` to turn a compiled AES function into an instruction list.
 */

import { formatHexAddress } from '@cryventure/core';

/** Assembly dialect: decides the line-comment marker (`#` is an immediate prefix on AArch64). */
export type AsmSyntax = 'intel' | 'arm';

export interface ParsedInstruction {
  mnemonic: string;
  operands: string[];
}

export interface DisassembledInstruction extends ParsedInstruction {
  /** Byte offset inside the object file's `.text`, as printed by objdump (hex, no `0x`). */
  offset: number;
}

const COMMENT_MARKER: Record<AsmSyntax, string> = { intel: '#', arm: '//' };

/** Splits an operand list on commas that are not inside `[...]` or `{...}`. */
export function splitOperands(text: string): string[] {
  const operands: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '[' || char === '{') depth += 1;
    if (char === ']' || char === '}') depth -= 1;
    if (char === ',' && depth === 0) {
      operands.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim() !== '') operands.push(current.trim());
  return operands;
}

/** Parses one instruction body (`mnemonic op1, op2`), or `undefined` for blank text. */
export function parseInstructionText(text: string): ParsedInstruction | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const match = /^(\S+)\s*(.*)$/.exec(trimmed);
  if (match === null) return undefined;
  return { mnemonic: match[1] ?? '', operands: splitOperands(match[2] ?? '') };
}

function stripComment(line: string, syntax: AsmSyntax): string {
  const at = line.indexOf(COMMENT_MARKER[syntax]);
  return at === -1 ? line : line.slice(0, at);
}

function isFunctionEnd(line: string): boolean {
  return /^\s*\.(size|cfi_endproc)\b/.test(line) || /^\.Lfunc_end\d*:/.test(line);
}

function isInstructionLine(code: string): boolean {
  const trimmed = code.trim();
  return trimmed !== '' && !trimmed.startsWith('.') && !trimmed.endsWith(':');
}

/** Lines of `asm` that belong to `functionName`, from its label up to the end marker. */
function functionBody(asm: string, functionName: string): string[] {
  const lines = asm.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`${functionName}:`));
  if (start === -1) throw new Error(`function ${functionName} not found in assembly`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(isFunctionEnd);
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * Instructions of one function in `clang -S` output: directives, labels and comments are stripped,
 * instruction lines are kept in program order.
 */
export function parseAsmFunction(
  asm: string,
  functionName: string,
  syntax: AsmSyntax,
): ParsedInstruction[] {
  return functionBody(asm, functionName)
    .map((line) => stripComment(line, syntax))
    .filter(isInstructionLine)
    .map((code) => parseInstructionText(code))
    .filter((parsed): parsed is ParsedInstruction => parsed !== undefined);
}

const OBJDUMP_SYMBOL = /^[0-9a-f]+ <(.+)>:$/;
const OBJDUMP_LINE = /^\s*([0-9a-f]+):\s*(.*)$/;

/** Instructions of one function in `llvm-objdump -d --no-show-raw-insn` output, with byte offsets. */
export function parseObjdumpFunction(
  dump: string,
  functionName: string,
): DisassembledInstruction[] {
  const result: DisassembledInstruction[] = [];
  let inside = false;
  for (const line of dump.split(/\r?\n/)) {
    const symbol = OBJDUMP_SYMBOL.exec(line.trim());
    if (symbol !== null) {
      inside = symbol[1] === functionName;
      continue;
    }
    const match = inside ? OBJDUMP_LINE.exec(line) : null;
    const parsed = match === null ? undefined : parseInstructionText(match[2] ?? '');
    if (match !== null && parsed !== undefined)
      result.push({ ...parsed, offset: Number.parseInt(match[1] ?? '', 16) });
  }
  if (result.length === 0) throw new Error(`function ${functionName} not found in disassembly`);
  return result;
}

/** Formats a byte offset as the listing's `address` (`0x` + hex). */
export function formatAddress(offset: number): string {
  return formatHexAddress(BigInt(offset));
}

const PADDING_MNEMONICS = new Set(['nop', 'int3', 'udf']);

/** Drops the alignment padding objdump shows after a function's last instruction (e.g. `nop` before the next symbol). */
export function withoutTrailingPadding(
  disassembly: readonly DisassembledInstruction[],
): DisassembledInstruction[] {
  let end = disassembly.length;
  while (end > 0 && PADDING_MNEMONICS.has(disassembly[end - 1]?.mnemonic ?? '')) end -= 1;
  return disassembly.slice(0, end);
}

/**
 * Pairs the compiler's listing with objdump's byte offsets (same instructions, same order).
 * Offsets are rebased to the function's first instruction, so every listing starts at `0x0`
 * wherever its function sits in `.text`. Trailing alignment padding in the disassembly is ignored.
 * Throws when the two disagree on count or mnemonic, so a mismatch never ships silently.
 */
export function attachAddresses(
  listing: readonly ParsedInstruction[],
  fullDisassembly: readonly DisassembledInstruction[],
): (ParsedInstruction & { address: string })[] {
  const disassembly =
    listing.at(-1)?.mnemonic === 'nop' ? fullDisassembly : withoutTrailingPadding(fullDisassembly);
  if (listing.length !== disassembly.length) {
    throw new Error(
      `listing has ${listing.length} instructions, disassembly has ${disassembly.length}`,
    );
  }
  const functionStart = disassembly[0]?.offset ?? 0;
  return listing.map((instruction, index) => {
    const dumped = disassembly[index];
    if (dumped === undefined || dumped.mnemonic !== instruction.mnemonic) {
      throw new Error(
        `instruction ${index}: listing '${instruction.mnemonic}' vs disassembly '${dumped?.mnemonic}'`,
      );
    }
    return { ...instruction, address: formatAddress(dumped.offset - functionStart) };
  });
}
