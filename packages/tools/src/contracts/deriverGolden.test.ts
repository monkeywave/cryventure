import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { GOLDEN_UPDATE_ENV, goldenDir, goldenJson, readGoldenFiles, writeGoldenFile } from './deriverGolden.ts';

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cv-golden-files-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('goldenDir', () => {
  it('points at the deriver fixtures folder', () => {
    expect(goldenDir('isa-x86')).toBe(join(REPO_ROOT, 'packages/derivers/src/isa-x86/fixtures'));
    expect(goldenDir('memory', '/r')).toBe('/r/packages/derivers/src/memory/fixtures');
  });
});

describe('readGoldenFiles', () => {
  it('is empty for a missing folder', () => expect(readGoldenFiles(join(dir, 'missing'))).toEqual([]));

  it('reads *.golden.json sorted, defaulting facets and reporting malformed files', () => {
    writeFileSync(join(dir, 'b.golden.json'), '{"producerId":"aes","presetId":"defaults"}');
    writeFileSync(join(dir, 'a.golden.json'), '[');
    writeFileSync(join(dir, 'c.golden.json'), '{"producerId":"aes"}');
    writeFileSync(join(dir, 'notes.json'), '{}');
    const files = readGoldenFiles(dir);
    expect(files.map(({ path }) => path)).toEqual(['a', 'b', 'c'].map((name) => join(dir, `${name}.golden.json`)));
    expect(files[0]?.fixture).toEqual({ problem: expect.stringContaining('invalid JSON') });
    expect(files[1]?.fixture).toEqual({ producerId: 'aes', presetId: 'defaults', facets: {} });
    expect(files[2]?.fixture).toEqual({ problem: 'needs string producerId and presetId' });
  });
});

describe('goldenJson / writeGoldenFile', () => {
  it('writes pretty JSON in a fixed key order with a trailing newline', () => {
    const path = join(dir, 'x.golden.json');
    writeGoldenFile(path, { facets: { 'a@b': 1 }, presetId: 'p', producerId: 'q' } as never);
    expect(readFileSync(path, 'utf8')).toBe(goldenJson({ producerId: 'q', presetId: 'p', facets: { 'a@b': 1 } }));
    expect(readFileSync(path, 'utf8')).toBe('{\n  "producerId": "q",\n  "presetId": "p",\n  "facets": {\n    "a@b": 1\n  }\n}\n');
  });
});

describe('GOLDEN_UPDATE_ENV', () => {
  it('is the flag pnpm golden:update sets', () => {
    expect(GOLDEN_UPDATE_ENV).toBe('CV_GOLDEN_UPDATE');
  });
});
