import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({ reads: [] as string[], listings: [] as string[] }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: ((path: string, ...rest: unknown[]) => {
      io.reads.push(String(path));
      return (actual.readFileSync as (...args: unknown[]) => unknown)(path, ...rest);
    }) as typeof actual.readFileSync,
    readdirSync: ((path: string, ...rest: unknown[]) => {
      io.listings.push(String(path));
      return (actual.readdirSync as (...args: unknown[]) => unknown)(path, ...rest);
    }) as typeof actual.readdirSync,
  };
});

const { runParityCheck } = await import('./check-parity.ts');

let root = '';

function write(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'cv-parity-io-'));
  write('packages/primitives/src/aes/i18n/en.json', '{"plugin.aes.title":"AES cipher"}');
  write('packages/primitives/src/aes/i18n/de.json', '{"plugin.aes.title":"AES-Chiffre"}');
  write('apps/web/src/content/docs/en/index.mdx', '# Hi');
  write('apps/web/src/content/docs/de/index.mdx', '---\nsourceHash: sha256:00\n---\n# Hallo');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const duplicates = (paths: readonly string[]) => paths.filter((path, index) => paths.indexOf(path) !== index);

describe('runParityCheck I/O', () => {
  it('lists every directory and reads every file at most once', () => {
    io.reads.length = 0;
    io.listings.length = 0;
    runParityCheck(root);
    expect(io.reads.length).toBeGreaterThanOrEqual(4);
    expect(duplicates(io.reads)).toEqual([]);
    expect(duplicates(io.listings)).toEqual([]);
  });
});
