import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isFixturesUpdate, readSnapshot, SNAPSHOT_FIXTURES, writeSnapshotIfChanged } from './snapshotFixtures.ts';

describe('committed snapshot fixtures', () => {
  it.each(SNAPSHOT_FIXTURES.map((fixture) => [fixture.path, fixture] as const))('%s equals a fresh run', async (path, fixture) => {
    const fresh = await fixture.build();
    if (isFixturesUpdate()) writeSnapshotIfChanged(path, fresh);
    expect(readSnapshot(path)).toEqual(JSON.parse(JSON.stringify(fresh)));
  });

  it('lists each file once', () => {
    const paths = SNAPSHOT_FIXTURES.map((fixture) => fixture.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('isFixturesUpdate', () => {
  it('is on only for CV_FIXTURES_UPDATE=1', () => {
    expect([isFixturesUpdate({ CV_FIXTURES_UPDATE: '1' }), isFixturesUpdate({ CV_FIXTURES_UPDATE: '0' }), isFixturesUpdate({})]).toEqual([true, false, false]);
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
