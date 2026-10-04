/**
 * `buildListings` with an injected compiler runner: the fake compiler replays the committed
 * listings as assembly and disassembly (each function placed at a non-zero `.text` offset), so the
 * whole parse → address → annotate pipeline runs without clang.
 */
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { buildListings, type AsmListing, type ListingInstruction } from './generate.ts';

/** Each C source → the functions it defines and their committed listing (deriver folder, file). */
const SOURCES: Record<string, readonly { name: string; isa: string; file: string }[]> = {
  'aes_x86.c': [128, 192, 256].map((bits) => ({
    name: `aes_encrypt_block_${bits}`,
    isa: 'isa-x86',
    file: `aes${bits}.json`,
  })),
  'aes_armv8.c': [128, 192, 256].map((bits) => ({
    name: `aes_encrypt_block_${bits}`,
    isa: 'isa-armv8',
    file: `aes${bits}.json`,
  })),
  'sha256_x86.c': [{ name: 'sha256_compress_block', isa: 'isa-x86-sha', file: 'sha256.json' }],
  'sha256_armv8.c': [{ name: 'sha256_compress_block', isa: 'isa-armv8-sha', file: 'sha256.json' }],
};
const FUNCTION_STRIDE = 0x400;

function committed(isa: string, file: string): AsmListing<ListingInstruction> {
  const path = join(REPO_ROOT, 'packages/derivers/src', isa, 'data', file);
  return JSON.parse(readFileSync(path, 'utf8')) as AsmListing<ListingInstruction>;
}

/** Instructions with addresses relative to the function's first instruction. */
function rebased(instructions: readonly ListingInstruction[]): ListingInstruction[] {
  const start = Number.parseInt(instructions[0]!.address, 16);
  return instructions.map((entry) => ({
    ...entry,
    address: `0x${(Number.parseInt(entry.address, 16) - start).toString(16)}`,
  }));
}

function fakeAsm(sourceFile: string): string {
  return SOURCES[sourceFile]!.map(({ name, isa, file }) => {
    const body = committed(isa, file).instructions.map(
      ({ mnemonic, operands }) => `\t${mnemonic}\t${operands.join(', ')}`,
    );
    return [`${name}:`, ...body, '.Lfunc_end0:'].join('\n');
  }).join('\n');
}

function fakeDump(sourceFile: string): string {
  return SOURCES[sourceFile]!.map(({ name, isa, file }, index) => {
    const instructions = rebased(committed(isa, file).instructions);
    const base = (index + 1) * FUNCTION_STRIDE;
    const lines = instructions.map(
      ({ address, mnemonic, operands }) =>
        `  ${(base + Number.parseInt(address, 16)).toString(16)}:\t${mnemonic}\t${operands.join(', ')}`,
    );
    return [`${base.toString(16).padStart(16, '0')} <${name}>:`, ...lines].join('\n');
  }).join('\n\n');
}

/** Replays the committed listings; the object file name is remembered from the `-c` compile. */
function fakeCompiler() {
  const commands: string[] = [];
  const sourceByObject = new Map<string, string>();
  const run = (command: string, args: readonly string[]) => {
    commands.push(command);
    if (args[0] === '--version') return 'Homebrew clang version 23.1.0\n';
    if (command.endsWith('objdump')) return fakeDump(sourceByObject.get(args.at(-1)!)!);
    const sourceFile = basename(args.find((arg) => arg.endsWith('.c'))!);
    if (args.includes('-c')) sourceByObject.set(args[args.indexOf('-o') + 1]!, sourceFile);
    return args.includes('-S') ? fakeAsm(sourceFile) : '';
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

  it('builds the six AES and two SHA-256 listings, each starting at 0x0 and matching the committed annotation', () => {
    const expected = Object.values(SOURCES).flat();
    expect(listings).toHaveLength(expected.length);
    expected.forEach(({ name, isa, file }, index) => {
      const { path, listing } = listings[index]!;
      expect(path).toContain(join(isa, 'data', file));
      expect(listing.function).toBe(name);
      expect(listing.compiler).toBe('Homebrew clang version 23.1.0');
      expect(listing.instructions[0]!.address).toBe('0x0');
      expect(listing.instructions).toEqual(rebased(committed(isa, file).instructions));
    });
  });
});
