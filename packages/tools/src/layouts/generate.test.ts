import { describe, expect, it } from 'vitest';
import {
  AES_KEY_SOURCE,
  buildLayout,
  clangArgs,
  generateLayout,
  probeRecordName,
  probeSource,
} from './generate.ts';
import { parseRecordLayoutDump } from './recordLayoutDump.ts';

// Fixed dumps (clang 23.1.0, x86_64-linux-gnu); these tests never invoke clang.
const RECORD_DUMP_TEXT = `
*** Dumping AST Record Layout
         0 | struct aes_key_st
         0 |   unsigned int[60] rd_key
       240 |   int rounds
           | [sizeof=244, align=4]
`;
const RECORD_DUMP = parseRecordLayoutDump(RECORD_DUMP_TEXT);

const PROBE_DUMP_TEXT = `
*** Dumping AST Record Layout
         0 | struct cv_size_rd_key
         0 |   unsigned int[60] v
           | [sizeof=240, align=4]

*** Dumping AST Record Layout
         0 | struct cv_elem_rd_key
         0 |   unsigned int v
           | [sizeof=4, align=4]

*** Dumping AST Record Layout
         0 | struct cv_size_rounds
         0 |   int v
           | [sizeof=4, align=4]
`;
const PROBE_DUMP = parseRecordLayoutDump(PROBE_DUMP_TEXT);

const COMPILER = {
  version: 'Homebrew clang version 23.1.0',
  args: ['-target', 'x86_64-linux-gnu'],
};

describe('probeSource', () => {
  const [record] = RECORD_DUMP;

  it('adds a size probe per field and an element probe per array field', () => {
    const source = probeSource('/* base */', record!);
    expect(source.startsWith('/* base */')).toBe(true);
    expect(source).toContain(
      `struct ${probeRecordName('rd_key', 'size')} { __typeof__(((struct aes_key_st *)0)->rd_key) v; };`,
    );
    expect(source).toContain(
      `struct ${probeRecordName('rd_key', 'elem')} { __typeof__(((struct aes_key_st *)0)->rd_key[0]) v; };`,
    );
    expect(source).toContain(`struct ${probeRecordName('rounds', 'size')} {`);
    expect(source).not.toContain(probeRecordName('rounds', 'elem'));
  });
});

describe('buildLayout', () => {
  it('merges offsets with probed sizes into the StructLayout shape', () => {
    const layout = buildLayout({
      recordName: 'aes_key_st',
      triple: 'x86_64-linux-gnu',
      dump: RECORD_DUMP,
      probeDump: PROBE_DUMP,
      source: AES_KEY_SOURCE,
      compiler: COMPILER,
    });
    expect(layout).toEqual({
      name: 'aes_key_st',
      triple: 'x86_64-linux-gnu',
      size: 244,
      align: 4,
      source: AES_KEY_SOURCE,
      compiler: COMPILER,
      fields: [
        { name: 'rd_key', offset: 0, size: 240, type: 'unsigned int[60]', count: 60, elemSize: 4 },
        { name: 'rounds', offset: 240, size: 4, type: 'int' },
      ],
    });
  });

  it('fails loudly when the record or a probe is missing', () => {
    const base = {
      triple: 'x86_64-linux-gnu',
      dump: RECORD_DUMP,
      source: AES_KEY_SOURCE,
      compiler: COMPILER,
    };
    expect(() => buildLayout({ ...base, recordName: 'nope', probeDump: PROBE_DUMP })).toThrow(
      /record nope not found/,
    );
    expect(() => buildLayout({ ...base, recordName: 'aes_key_st', probeDump: [] })).toThrow(
      /cv_size_rd_key/,
    );
  });
});

describe('clangArgs', () => {
  it('targets the triple and dumps layouts from stdin without compiling', () => {
    expect(clangArgs('aarch64-linux-gnu')).toEqual([
      '-target',
      'aarch64-linux-gnu',
      '-Xclang',
      '-fdump-record-layouts',
      '-fsyntax-only',
      '-x',
      'c',
      '-',
    ]);
  });
});

describe('generateLayout (injected compiler runner)', () => {
  it('dumps the record, then the probes, and records the compiler it ran', () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const run = (command: string, args: readonly string[], input?: string) => {
      calls.push({ command, args });
      if (args[0] === '--version') return 'Homebrew clang version 23.1.0\nTarget: arm64\n';
      return input?.includes(probeRecordName('rounds', 'size'))
        ? PROBE_DUMP_TEXT
        : RECORD_DUMP_TEXT;
    };
    const layout = generateLayout('x86_64-linux-gnu', 'struct aes_key_st;', {
      clang: '/pinned/clang',
      run,
    });
    expect(calls.map(({ command }) => command)).toEqual(Array(3).fill('/pinned/clang'));
    expect(layout.compiler).toEqual({
      version: 'Homebrew clang version 23.1.0',
      args: clangArgs('x86_64-linux-gnu').slice(0, -1),
    });
    expect(layout.fields.map(({ name, size }) => [name, size])).toEqual([
      ['rd_key', 240],
      ['rounds', 4],
    ]);
  });
});
