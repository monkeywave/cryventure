/**
 * Dev-only generator for the precomputed assembly listings (docs/M4.md §5, docs/M5.md §5b):
 *   pnpm asm:generate
 * For every kernel in the table (AES, SHA-256) compiles its x86 and ARMv8 C source with the pinned
 * LLVM (`llvm.ts`), parses each function's assembly, takes real byte offsets from `llvm-objdump`,
 * annotates roles, and writes packages/derivers/src/isa-{x86,armv8}/data/aes{128,192,256}.json and
 * packages/derivers/src/isa-{x86,armv8}-sha/data/sha256.json. CI never runs this; tests read the
 * committed JSON.
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
} from './annotate.ts';
import {
  compilerVersion,
  pinnedLlvm,
  runCommand,
  type CommandRunner,
  type LlvmTools,
} from './llvm.ts';
import {
  annotateShaListing,
  ARMV8_SHA_PROFILE,
  X86_SHA_PROFILE,
  type ShaAnnotatedInstruction,
} from './annotateSha.ts';
import {
  attachAddresses,
  parseAsmFunction,
  parseObjdumpFunction,
  type AsmSyntax,
  type ParsedInstruction,
} from './parse.ts';
import { compilerExplorerUrl, extractCFunction, extractPreamble } from './source.ts';

const ASM_DIR = dirname(fileURLToPath(import.meta.url));

/** One instruction set: the target triple and how its assembly and disassembly read. */
interface Isa {
  triple: string;
  syntax: AsmSyntax;
  objdumpFlags: readonly string[];
  /** Compiler Explorer id (best effort, see `compilerExplorerUrl`). */
  compilerExplorerId: string;
}

const X86: Isa = {
  triple: 'x86_64-linux-gnu',
  syntax: 'intel',
  objdumpFlags: ['-M', 'intel'],
  compilerExplorerId: 'cclang_trunk',
};

const ARMV8: Isa = {
  triple: 'aarch64-linux-gnu',
  syntax: 'arm',
  objdumpFlags: [],
  compilerExplorerId: 'armv8-cclang-trunk',
};

type AddressedInstruction = ParsedInstruction & { address: string };

/** One kernel compiled for one ISA: its C source, flags, deriver folder and role annotator. */
interface KernelTarget {
  isa: Isa;
  /** Deriver folder under packages/derivers/src that ships the listings (`isa-x86`, …). */
  directory: string;
  sourceFile: string;
  /** Flags besides `-target`, `-S`/`-c`, shared by both compiles. */
  flags: readonly string[];
  annotate: (instructions: readonly AddressedInstruction[]) => ListingInstruction[];
}

/** A compiled kernel: its functions (each one listing file per target) and the targets. */
interface Kernel {
  kernel: 'aes' | 'sha256';
  /** Function name → listing file in the target's `data/` folder; the first one ends the preamble. */
  functions: readonly { name: string; file: string }[];
  targets: readonly KernelTarget[];
}

const AES_KEY_BITS = [128, 192, 256] as const;

/** The kernel table (docs/M4.md §5, docs/M5.md §5b). */
const KERNELS: readonly Kernel[] = [
  {
    kernel: 'aes',
    functions: AES_KEY_BITS.map((bits) => ({
      name: `aes_encrypt_block_${bits}`,
      file: `aes${bits}.json`,
    })),
    targets: [
      {
        isa: X86,
        directory: 'isa-x86',
        sourceFile: 'aes_x86.c',
        flags: ['-O2', '-maes', '-masm=intel', '-ffreestanding'],
        annotate: (instructions) => annotateListing(instructions, X86_PROFILE),
      },
      {
        isa: ARMV8,
        directory: 'isa-armv8',
        sourceFile: 'aes_armv8.c',
        flags: ['-march=armv8-a+crypto', '-O2', '-ffreestanding'],
        annotate: (instructions) => annotateListing(instructions, ARMV8_PROFILE),
      },
    ],
  },
  {
    kernel: 'sha256',
    functions: [{ name: 'sha256_compress_block', file: 'sha256.json' }],
    targets: [
      {
        isa: X86,
        directory: 'isa-x86-sha',
        sourceFile: 'sha256_x86.c',
        flags: ['-O2', '-msha', '-mssse3', '-msse4.1', '-masm=intel', '-ffreestanding'],
        annotate: (instructions) => annotateShaListing(instructions, X86_SHA_PROFILE),
      },
      {
        isa: ARMV8,
        directory: 'isa-armv8-sha',
        sourceFile: 'sha256_armv8.c',
        flags: ['-O2', '-march=armv8-a+sha2', '-ffreestanding'],
        annotate: (instructions) => annotateShaListing(instructions, ARMV8_SHA_PROFILE),
      },
    ],
  },
];

/** An annotated instruction of either kernel's role set. */
export type ListingInstruction = AnnotatedInstruction | ShaAnnotatedInstruction;

export interface AsmListing<Instruction extends ListingInstruction = AnnotatedInstruction> {
  compiler: string;
  flags: string;
  triple: string;
  function: string;
  source: string;
  compilerExplorerUrl: string;
  instructions: Instruction[];
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
  kernel: Kernel,
  target: KernelTarget,
  workDir: string,
  run: CommandRunner,
  tools: LlvmTools,
): CompiledTarget {
  const input = join(ASM_DIR, target.sourceFile);
  const base = ['-target', target.isa.triple, ...target.flags];
  const objectPath = join(workDir, `${kernel.kernel}-${target.directory}.o`);
  const asm = run(tools.clang, [...base, '-S', input, '-o', '-']);
  run(tools.clang, [...base, '-c', input, '-o', objectPath]);
  return {
    asm,
    dump: run(tools.objdump, ['-d', '--no-show-raw-insn', ...target.isa.objdumpFlags, objectPath]),
  };
}

function buildListing(
  kernel: Kernel,
  target: KernelTarget,
  compiled: CompiledTarget,
  cSource: string,
  compiler: string,
  functionName: string,
): AsmListing<ListingInstruction> {
  const { isa } = target;
  const flags = ['-target', isa.triple, ...target.flags, '-S'].join(' ');
  const functionSource = extractCFunction(cSource, functionName);
  const preamble = extractPreamble(cSource, kernel.functions[0]!.name);
  const listing = parseAsmFunction(compiled.asm, functionName, isa.syntax);
  const addressed = attachAddresses(listing, parseObjdumpFunction(compiled.dump, functionName));
  return {
    compiler,
    flags,
    triple: isa.triple,
    function: functionName,
    source: functionSource,
    compilerExplorerUrl: compilerExplorerUrl(
      `${preamble}${functionSource}\n`,
      isa.compilerExplorerId,
      target.flags.join(' '),
    ),
    instructions: target.annotate(addressed),
  };
}

function outputPath(target: KernelTarget, file: string): string {
  return join(REPO_ROOT, 'packages/derivers/src', target.directory, 'data', file);
}

/** Runs the repo's Prettier over the written JSON so a regeneration is format-stable. */
function formatWithPrettier(run: CommandRunner, paths: readonly string[]): void {
  run(join(REPO_ROOT, 'node_modules/.bin/prettier'), ['--write', '--log-level', 'warn', ...paths]);
}

export interface GeneratedListing {
  path: string;
  listing: AsmListing<ListingInstruction>;
}

/** Compiles every kernel for every target and builds its listings, without writing anything. */
export function buildListings({
  run = runCommand,
  tools = pinnedLlvm(),
}: GenerateOptions = {}): GeneratedListing[] {
  const compiler = compilerVersion(run, tools.clang);
  const workDir = mkdtempSync(join(tmpdir(), 'cv-asm-'));
  try {
    return KERNELS.flatMap((kernel) =>
      kernel.targets.flatMap((target) => {
        const compiled = compile(kernel, target, workDir, run, tools);
        const cSource = readFileSync(join(ASM_DIR, target.sourceFile), 'utf8');
        return kernel.functions.map(({ name, file }) => ({
          path: outputPath(target, file),
          listing: buildListing(kernel, target, compiled, cSource, compiler, name),
        }));
      }),
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/** Compiles every kernel and writes its listings (Prettier-formatted); returns the paths written. */
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
