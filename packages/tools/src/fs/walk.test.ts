import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REPO_ROOT } from './repoRoot.ts';
import { listFiles, relativePosix, toPosix } from './walk.ts';

let root = '';

function touch(path: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), '');
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'cv-walk-'));
  ['a.json', 'b/c.json', 'b/d.txt', 'node_modules/x.json', 'dist/y.json'].forEach(touch);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('listFiles', () => {
  it('lists files recursively, sorted, skipping build and dependency folders', () => {
    expect(listFiles(root)).toEqual(['a.json', 'b/c.json', 'b/d.txt']);
  });

  it('applies the accept filter to relative POSIX paths', () => {
    expect(listFiles(root, (path) => path.endsWith('.json'))).toEqual(['a.json', 'b/c.json']);
  });

  it('returns an empty list for a missing root', () => {
    expect(listFiles(join(root, 'nope'))).toEqual([]);
  });
});

describe('toPosix / relativePosix', () => {
  it('normalises separators and relativises', () => {
    expect(toPosix('a/b')).toBe('a/b');
    expect(relativePosix(root, join(root, 'b', 'c.json'))).toBe('b/c.json');
  });
});

describe('REPO_ROOT', () => {
  it('points at the monorepo root', () => {
    expect(listFiles(join(REPO_ROOT, 'packages', 'core'), (path) => path === 'package.json')).toEqual(['package.json']);
  });
});
