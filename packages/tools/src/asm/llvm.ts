import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * The one pinned LLVM toolchain both dev-only generators (`asm:generate`, `layouts:generate`) use,
 * so listings and layouts always come from the same compiler. `CV_LLVM_BIN` picks the LLVM `bin`
 * directory (default: Homebrew's llvm); `CLANG` overrides the compiler binary alone.
 */
export const DEFAULT_LLVM_BIN = '/opt/homebrew/opt/llvm/bin';

export interface LlvmTools {
  clang: string;
  objdump: string;
}

export function pinnedLlvm(
  env: Readonly<Record<string, string | undefined>> = process.env,
): LlvmTools {
  const bin = env['CV_LLVM_BIN'] ?? DEFAULT_LLVM_BIN;
  return { clang: env['CLANG'] ?? join(bin, 'clang'), objdump: join(bin, 'llvm-objdump') };
}

/** Runs a command (stdin = `input`) and returns its stdout; injectable so tests never need a compiler. */
export type CommandRunner = (command: string, args: readonly string[], input?: string) => string;

export const runCommand: CommandRunner = (command, args, input) =>
  execFileSync(command, args, { encoding: 'utf8', ...(input === undefined ? {} : { input }) });

/** First line of `<clang> --version`. */
export function compilerVersion(run: CommandRunner, clang: string): string {
  return run(clang, ['--version']).split('\n')[0]?.trim() ?? '';
}
