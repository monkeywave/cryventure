import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES_UPDATE_ENV, readSnapshot, SNAPSHOT_FIXTURES, writeSnapshotIfChanged } from './snapshotFixtures.ts';
import { isUpdateRun } from './updateRun.ts';

describe('committed snapshot fixtures', () => {
  it.each(SNAPSHOT_FIXTURES.map((fixture) => [fixture.path, fixture] as const))('%s equals a fresh run', async (path, fixture) => {
    const fresh = await fixture.build();
    if (isUpdateRun(FIXTURES_UPDATE_ENV)) writeSnapshotIfChanged(path, fresh);
    expect(readSnapshot(path)).toEqual(JSON.parse(JSON.stringify(fresh)));
  });

  it('lists each file once', () => {
    const paths = SNAPSHOT_FIXTURES.map((fixture) => fixture.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('FIXTURES_UPDATE_ENV', () => {
  it('is the flag pnpm fixtures:update sets', () => {
    expect(FIXTURES_UPDATE_ENV).toBe('CV_FIXTURES_UPDATE');
  });
});

describe('writeSnapshotIfChanged', () => {
  const root = () => mkdtempSync(join(tmpdir(), 'cv-snapshot-'));

  it('keeps an equal snapshot byte for byte (no reformatting)', () => {
    const dir = root();
    writeFileSync(join(dir, 'a.json'), '{"b":[1,2],"a":1}');
    expect(writeSnapshotIfChanged('a.json', { a: 1, b: [1, 2] }, dir)).toBe(false);
    expect(readFileSync(join(dir, 'a.json'), 'utf8')).toBe('{"b":[1,2],"a":1}');
  });

  it('rewrites a stale or missing snapshot, pretty-printed and without undefined fields', () => {
    const dir = root();
    writeFileSync(join(dir, 'a.json'), '{"a":0}');
    expect(writeSnapshotIfChanged('a.json', { a: 1, gone: undefined }, dir)).toBe(true);
    expect(writeSnapshotIfChanged('new.json', [1], dir)).toBe(true);
    expect(readFileSync(join(dir, 'a.json'), 'utf8')).toBe('{\n  "a": 1\n}\n');
    expect(readSnapshot('new.json', dir)).toEqual([1]);
  });
});
