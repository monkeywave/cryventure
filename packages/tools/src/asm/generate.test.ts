/**
 * `buildListings` with an injected compiler runner: the fake compiler replays the committed
 * listings as assembly and disassembly (each function placed at a non-zero `.text` offset), so the
 * whole parse → address → annotate pipeline runs without clang.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import type { AnnotatedInstruction } from './annotate.ts';
import { buildListings, type AsmListing } from './generate.ts';

const ISA_BY_TRIPLE: Record<string, 'isa-x86' | 'isa-armv8'> = {
  'x86_64-linux-gnu': 'isa-x86',
  'aarch64-linux-gnu': 'isa-armv8',
};
const KEY_BITS = [128, 192, 256] as const;
const FUNCTION_STRIDE = 0x200;

function committed(isa: string, bits: number): AsmListing {
  const path = join(REPO_ROOT, 'packages/derivers/src', isa, 'data', `aes${bits}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as AsmListing;
}

/** Instructions with addresses relative to the function's first instruction. */
function rebased(instructions: readonly AnnotatedInstruction[]): AnnotatedInstruction[] {
  const start = Number.parseInt(instructions[0]!.address, 16);
  return instructions.map((entry) => ({
    ...entry,
    address: `0x${(Number.parseInt(entry.address, 16) - start).toString(16)}`,
  }));
}

function fakeAsm(isa: string): string {
  return KEY_BITS.map((bits) => {
    const body = committed(isa, bits).instructions.map(
      ({ mnemonic, operands }) => `\t${mnemonic}\t${operands.join(', ')}`,
    );
    return [`aes_encrypt_block_${bits}:`, ...body, '.Lfunc_end0:'].join('\n');
  }).join('\n');
}

function fakeDump(isa: string): string {
  return KEY_BITS.map((bits, index) => {
    const instructions = rebased(committed(isa, bits).instructions);
    const base = (index + 1) * FUNCTION_STRIDE;
    const lines = instructions.map(
      ({ address, mnemonic, operands }) =>
        `  ${(base + Number.parseInt(address, 16)).toString(16)}:\t${mnemonic}\t${operands.join(', ')}`,
    );
    return [`${base.toString(16).padStart(16, '0')} <aes_encrypt_block_${bits}>:`, ...lines].join(
      '\n',
    );
  }).join('\n\n');
}

function fakeCompiler() {
  const commands: string[] = [];
  let lastTriple = '';
  const run = (command: string, args: readonly string[]) => {
    commands.push(command);
    if (args[0] === '--version') return 'Homebrew clang version 23.1.0\n';
    const target = args.indexOf('-target');
    if (target !== -1) lastTriple = args[target + 1]!;
    const isa = ISA_BY_TRIPLE[lastTriple]!;
    if (command.endsWith('objdump')) return fakeDump(isa);
    return args.includes('-S') ? fakeAsm(isa) : '';
  };
  return { run, commands };
}

describe('buildListings (injected compiler runner)', () => {
  const tools = { clang: '/pinned/clang', objdump: '/pinned/llvm-objdump' };
  const { run, commands } = fakeCompiler();
  const listings = buildListings({ run, tools });

  it('runs only the pinned clang and llvm-objdump', () => {
    expect(new Set(commands)).toEqual(new Set([tools.clang, tools.objdump]));
  });

  it('builds all six listings, each starting at 0x0 and matching the committed annotation', () => {
    expect(listings).toHaveLength(6);
    for (const { path, listing } of listings) {
      const isa = ISA_BY_TRIPLE[listing.triple]!;
      const bits = Number(/aes(\d+)\.json$/.exec(path)![1]);
      expect(path).toContain(join(isa, 'data', `aes${bits}.json`));
      expect(listing.compiler).toBe('Homebrew clang version 23.1.0');
      expect(listing.instructions[0]!.address).toBe('0x0');
      expect(listing.instructions).toEqual(rebased(committed(isa, bits).instructions));
    }
  });
});
