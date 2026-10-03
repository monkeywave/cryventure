/**
 * Dev-only generator for the precomputed AES listings (docs/M4.md §5):
 *   pnpm asm:generate
 * Compiles aes_x86.c / aes_armv8.c with the pinned LLVM (`llvm.ts`), parses each function's assembly,
 * takes real byte offsets from `llvm-objdump`, annotates roles, and writes
 * packages/derivers/src/isa-{x86,armv8}/data/aes{128,192,256}.json. CI never runs this; tests read
 * the committed JSON.
 */
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
  compilerVersion,
  pinnedLlvm,
  runCommand,
  type CommandRunner,
  type LlvmTools,
} from './llvm.ts';
import {
  attachAddresses,
  parseAsmFunction,
  parseObjdumpFunction,
  type AsmSyntax,
} from './parse.ts';
import { compilerExplorerUrl, extractCFunction, extractPreamble } from './source.ts';

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

/** How the generator reaches the compiler: injectable so tests never need one. */
export interface GenerateOptions {
  run?: CommandRunner;
  tools?: LlvmTools;
}

interface CompiledTarget {
  asm: string;
  dump: string;
}

function compile(
  target: Target,
  workDir: string,
  run: CommandRunner,
  tools: LlvmTools,
): CompiledTarget {
  const input = join(ASM_DIR, target.sourceFile);
  const base = ['-target', target.triple, ...target.flags];
  const objectPath = join(workDir, `${target.directory}.o`);
  const asm = run(tools.clang, [...base, '-S', input, '-o', '-']);
  run(tools.clang, [...base, '-c', input, '-o', objectPath]);
  return {
    asm,
    dump: run(tools.objdump, ['-d', '--no-show-raw-insn', ...target.objdumpFlags, objectPath]),
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
function formatWithPrettier(run: CommandRunner, paths: readonly string[]): void {
  run(join(REPO_ROOT, 'node_modules/.bin/prettier'), ['--write', '--log-level', 'warn', ...paths]);
}

export interface GeneratedListing {
  path: string;
  listing: AsmListing;
}

/** Compiles every target and builds the six listings, without writing anything. */
export function buildListings({
  run = runCommand,
  tools = pinnedLlvm(),
}: GenerateOptions = {}): GeneratedListing[] {
  const compiler = compilerVersion(run, tools.clang);
  const workDir = mkdtempSync(join(tmpdir(), 'cv-asm-'));
  try {
    return TARGETS.flatMap((target) => {
      const compiled = compile(target, workDir, run, tools);
      const cSource = readFileSync(join(ASM_DIR, target.sourceFile), 'utf8');
      return KEY_BITS.map((bits) => ({
        path: outputPath(target, bits),
        listing: buildListing(target, compiled, cSource, compiler, bits),
      }));
    });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/** Compiles every target and writes the six listings (Prettier-formatted); returns the paths written. */
export function generateListings(options: GenerateOptions = {}): string[] {
  const paths = buildListings(options).map(({ path, listing }) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(listing, null, 2)}\n`);
    return path;
  });
  formatWithPrettier(options.run ?? runCommand, paths);
  return paths;
}

if (isEntryPoint(import.meta.url)) {
  generateListings().forEach((path) => console.log(`wrote ${path.slice(REPO_ROOT.length)}`));
}
