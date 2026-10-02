import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readCatalogFile } from './catalogFile.ts';

let root = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'cv-catalog-'));
  writeFileSync(join(root, 'flat.json'), JSON.stringify({ 'a.b': 'x' }));
  writeFileSync(join(root, 'nested.json'), JSON.stringify({ a: { b: 'x', c: { d: 'y' } } }));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('readCatalogFile', () => {
  it('reads flat catalogs unchanged and flattens nested ones', () => {
    expect(readCatalogFile(join(root, 'flat.json'))).toEqual({ 'a.b': 'x' });
    expect(readCatalogFile(join(root, 'nested.json'))).toEqual({ 'a.b': 'x', 'a.c.d': 'y' });
  });

  it('returns an empty catalog for a missing file', () => {
    expect(readCatalogFile(join(root, 'missing.json'))).toEqual({});
  });
});
