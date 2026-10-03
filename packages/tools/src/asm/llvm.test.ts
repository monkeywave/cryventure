import { describe, expect, it } from 'vitest';
import { compilerVersion, DEFAULT_LLVM_BIN, pinnedLlvm } from './llvm.ts';

describe('pinnedLlvm', () => {
  it('defaults to the pinned Homebrew LLVM for clang and llvm-objdump', () => {
    expect(pinnedLlvm({})).toEqual({
      clang: `${DEFAULT_LLVM_BIN}/clang`,
      objdump: `${DEFAULT_LLVM_BIN}/llvm-objdump`,
    });
  });

  it('honours CV_LLVM_BIN, and CLANG for the compiler alone', () => {
    expect(pinnedLlvm({ CV_LLVM_BIN: '/llvm/bin' })).toEqual({
      clang: '/llvm/bin/clang',
      objdump: '/llvm/bin/llvm-objdump',
    });
    expect(pinnedLlvm({ CLANG: '/x/clang-23' }).clang).toBe('/x/clang-23');
  });
});

describe('compilerVersion', () => {
  it('returns the first line of --version', () => {
    const run = (command: string, args: readonly string[]) =>
      `${command} ${args.join(' ')}\nTarget: x\n`;
    expect(compilerVersion(run, 'clang')).toBe('clang --version');
  });
});
