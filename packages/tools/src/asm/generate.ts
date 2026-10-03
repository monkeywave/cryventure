/**
 * Dev-only generator for the precomputed AES listings (docs/M4.md §5):
 *   pnpm asm:generate
 * Compiles aes_x86.c / aes_armv8.c with the pinned Homebrew clang, parses each function's assembly,
 * takes real byte offsets from `llvm-objdump`, annotates roles, and writes
 * packages/derivers/src/isa-{x86,armv8}/data/aes{128,192,256}.json. CI never runs this; tests read
 * the committed JSON.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isEntryPoint } from '../fs/entryPoint.ts';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import {
  annotateListing,
  ARMV8_PROFILE,
  X86_PROFILE,
  type AnnotatedInstruction,
  type IsaProfile,
} from './annotate.ts';
import {
  attachAddresses,
  parseAsmFunction,
  parseObjdumpFunction,
  type AsmSyntax,
} from './parse.ts';
import { compilerExplorerUrl, extractCFunction, extractPreamble } from './source.ts';

const LLVM_BIN = process.env['CV_LLVM_BIN'] ?? '/opt/homebrew/opt/llvm/bin';
const CLANG = join(LLVM_BIN, 'clang');
const OBJDUMP = join(LLVM_BIN, 'llvm-objdump');
const ASM_DIR = dirname(fileURLToPath(import.meta.url));
const KEY_BITS = [128, 192, 256] as const;

interface Target {
  directory: string;
  sourceFile: string;
  triple: string;
  /** Flags besides `-target`, `-S`/`-c`, shared by both compiles. */
  flags: readonly string[];
  syntax: AsmSyntax;
  objdumpFlags: readonly string[];
  profile: IsaProfile;
  /** Compiler Explorer id (best effort, see `compilerExplorerUrl`). */
  compilerExplorerId: string;
}

const TARGETS: readonly Target[] = [
  {
    directory: 'isa-x86',
    sourceFile: 'aes_x86.c',
    triple: 'x86_64-linux-gnu',
    flags: ['-O2', '-maes', '-masm=intel', '-ffreestanding'],
    syntax: 'intel',
    objdumpFlags: ['-M', 'intel'],
    profile: X86_PROFILE,
    compilerExplorerId: 'cclang_trunk',
  },
  {
    directory: 'isa-armv8',
    sourceFile: 'aes_armv8.c',
    triple: 'aarch64-linux-gnu',
    flags: ['-march=armv8-a+crypto', '-O2', '-ffreestanding'],
    syntax: 'arm',
    objdumpFlags: [],
    profile: ARMV8_PROFILE,
    compilerExplorerId: 'armv8-cclang-trunk',
  },
];

export interface AsmListing {
  compiler: string;
  flags: string;
  triple: string;
  function: string;
  source: string;
  compilerExplorerUrl: string;
  instructions: AnnotatedInstruction[];
}

function run(command: string, args: readonly string[]): string {
  return execFileSync(command, args, { encoding: 'utf8' });
}

function compilerVersionLine(): string {
  return run(CLANG, ['--version']).split('\n')[0]?.trim() ?? '';
}

interface CompiledTarget {
  asm: string;
  dump: string;
}

function compile(target: Target, workDir: string): CompiledTarget {
  const input = join(ASM_DIR, target.sourceFile);
  const base = ['-target', target.triple, ...target.flags];
  const asmPath = join(workDir, `${target.directory}.s`);
  const objectPath = join(workDir, `${target.directory}.o`);
  run(CLANG, [...base, '-S', input, '-o', asmPath]);
  run(CLANG, [...base, '-c', input, '-o', objectPath]);
  return {
    asm: readFileSync(asmPath, 'utf8'),
    dump: run(OBJDUMP, ['-d', '--no-show-raw-insn', ...target.objdumpFlags, objectPath]),
  };
}

function buildListing(
  target: Target,
  compiled: CompiledTarget,
  cSource: string,
  compiler: string,
  bits: number,
): AsmListing {
  const functionName = `aes_encrypt_block_${bits}`;
  const flags = ['-target', target.triple, ...target.flags, '-S'].join(' ');
  const functionSource = extractCFunction(cSource, functionName);
  const explorerSource = `${extractPreamble(cSource, `aes_encrypt_block_${KEY_BITS[0]}`)}${functionSource}\n`;
  const listing = parseAsmFunction(compiled.asm, functionName, target.syntax);
  const addressed = attachAddresses(listing, parseObjdumpFunction(compiled.dump, functionName));
  return {
    compiler,
    flags,
    triple: target.triple,
    function: functionName,
    source: functionSource,
    compilerExplorerUrl: compilerExplorerUrl(
      explorerSource,
      target.compilerExplorerId,
      target.flags.join(' '),
    ),
    instructions: annotateListing(addressed, target.profile),
  };
}

function outputPath(target: Target, bits: number): string {
  return join(REPO_ROOT, 'packages/derivers/src', target.directory, 'data', `aes${bits}.json`);
}

/** Runs the repo's Prettier over the written JSON so a regeneration is format-stable. */
function formatWithPrettier(paths: readonly string[]): void {
  run(join(REPO_ROOT, 'node_modules/.bin/prettier'), ['--write', '--log-level', 'warn', ...paths]);
}

/** Compiles every target and writes the six listings (Prettier-formatted); returns the paths written. */
export function generateListings(): string[] {
  const compiler = compilerVersionLine();
  const workDir = mkdtempSync(join(tmpdir(), 'cv-asm-'));
  try {
    const paths = TARGETS.flatMap((target) => {
      const compiled = compile(target, workDir);
      const cSource = readFileSync(join(ASM_DIR, target.sourceFile), 'utf8');
      return KEY_BITS.map((bits) => {
        const path = outputPath(target, bits);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(
          path,
          `${JSON.stringify(buildListing(target, compiled, cSource, compiler, bits), null, 2)}\n`,
        );
        return path;
      });
    });
    formatWithPrettier(paths);
    return paths;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

if (isEntryPoint(import.meta.url)) {
  generateListings().forEach((path) => console.log(`wrote ${path.slice(REPO_ROOT.length)}`));
}
