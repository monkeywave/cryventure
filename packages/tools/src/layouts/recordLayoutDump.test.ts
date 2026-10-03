import { describe, expect, it } from 'vitest';
import { parseArrayType, parseRecordLayoutDump } from './recordLayoutDump.ts';

// Verbatim output of `clang -target x86_64-linux-gnu -Xclang -fdump-record-layouts -fsyntax-only` (clang 23.1.0).
const AES_KEY_DUMP = `
*** Dumping AST Record Layout
         0 | struct aes_key_st
         0 |   unsigned int[60] rd_key
       240 |   int rounds
           | [sizeof=244, align=4]
`;

const NESTED_DUMP = `
*** Dumping AST Record Layout
         0 | struct in
         0 |   char c
         2 |   short[3] s
           | [sizeof=8, align=2]

*** Dumping AST Record Layout
         0 | struct out
         0 |   char a
         2 |   struct in i
         2 |     char c
         4 |     short[3] s
        16 |   long l
           | [sizeof=24, align=8]
`;

describe('parseRecordLayoutDump', () => {
  it('parses name, size, align and field offsets/types', () => {
    expect(parseRecordLayoutDump(AES_KEY_DUMP)).toEqual([
      {
        name: 'aes_key_st',
        size: 244,
        align: 4,
        fields: [
          { name: 'rd_key', offset: 0, type: 'unsigned int[60]' },
          { name: 'rounds', offset: 240, type: 'int' },
        ],
      },
    ]);
  });

  it('keeps every block and only the top-level fields of nested records', () => {
    const [inner, outer] = parseRecordLayoutDump(NESTED_DUMP);
    expect(inner?.name).toBe('in');
    expect(outer).toEqual({
      name: 'out',
      size: 24,
      align: 8,
      fields: [
        { name: 'a', offset: 0, type: 'char' },
        { name: 'i', offset: 2, type: 'struct in' },
        { name: 'l', offset: 16, type: 'long' },
      ],
    });
  });

  it('returns nothing for output without layout blocks', () => {
    expect(parseRecordLayoutDump('')).toEqual([]);
  });

  it('rejects bitfields, which have no byte offset', () => {
    const dump = `*** Dumping AST Record Layout\n         0 | struct b\n     0:0-2 |   unsigned int x\n           | [sizeof=4, align=4]\n`;
    expect(() => parseRecordLayoutDump(dump)).toThrow(/bitfield/);
  });

  it('rejects a block without the sizeof/align footer', () => {
    const dump = `*** Dumping AST Record Layout\n         0 | struct b\n         0 |   int x\n`;
    expect(() => parseRecordLayoutDump(dump)).toThrow(/unrecognised record layout block/);
  });
});

describe('parseArrayType', () => {
  it('splits element type and count', () => {
    expect(parseArrayType('unsigned int[60]')).toEqual({ elemType: 'unsigned int', count: 60 });
  });

  it('is undefined for scalars', () => {
    expect(parseArrayType('int')).toBeUndefined();
  });
});
