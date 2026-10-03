import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import type { GeneratedLayout } from './generate.ts';

// Hand-written expectations for the committed AES_KEY layouts (docs/M4.md §4); CI checks these, it never runs clang.
const DATA_DIR = join(REPO_ROOT, 'packages/derivers/src/memory/data');

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, relativePath), 'utf8')) as T;
}

const triples = readJson<{ triple: string }[]>('targets.json').map((target) => target.triple);

describe('committed AES_KEY layouts', () => {
  it('covers exactly the two M4 triples', () => {
    expect(triples).toEqual(['x86_64-linux-gnu', 'aarch64-linux-gnu']);
  });

  describe.each(triples)('%s', (triple) => {
    const layout = readJson<GeneratedLayout>(`layouts/aes_key.${triple}.json`);
    const field = (name: string) => layout.fields.find((candidate) => candidate.name === name);

    it('is 244 bytes, align 4, for this triple', () => {
      expect(layout).toMatchObject({ name: 'aes_key_st', triple, size: 244, align: 4 });
    });

    it('has rd_key at offset 0 as 60 four-byte words', () => {
      expect(field('rd_key')).toMatchObject({ offset: 0, size: 240, count: 60, elemSize: 4 });
    });

    it('has rounds at offset 240', () => {
      expect(field('rounds')).toMatchObject({ offset: 240, size: 4 });
    });

    it('records the pinned OpenSSL source and the compiler', () => {
      expect(layout.source).toEqual({
        lib: 'OpenSSL',
        version: 'openssl-3.5.9',
        path: 'include/openssl/aes.h',
        line: 36,
      });
      expect(layout.compiler.version).toMatch(/clang version \d+/);
    });
  });
});
