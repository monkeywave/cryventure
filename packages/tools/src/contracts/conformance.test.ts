import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrimitiveModule, TraceBundle } from '@cryventure/core';
import { afterAll, describe, expect, it } from 'vitest';
import { conformanceFile, conformanceFormatProblems, conformanceProblems, loadConformanceVectors, outputProblems } from './conformance.ts';

const valid = { source: 'FIPS 197', cases: [{ name: 'one', params: { a: '01' }, outputs: { result: '0a0b' } }] };

describe('conformanceFile / loadConformanceVectors', () => {
  const root = mkdtempSync(join(tmpdir(), 'cv-conformance-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('points at <package>/src/<id>/vectors/conformance.json', () => {
    expect(conformanceFile('primitives', 'xor', '/repo')).toBe(join('/repo', 'packages', 'primitives', 'src', 'xor', 'vectors', 'conformance.json'));
  });

  it('parses an existing file and yields undefined for a missing one', () => {
    mkdirSync(join(root, 'packages', 'primitives', 'src', 'demo', 'vectors'), { recursive: true });
    writeFileSync(conformanceFile('primitives', 'demo', root), JSON.stringify(valid));
    expect(loadConformanceVectors('primitives', 'demo', root)).toEqual(valid);
    expect(loadConformanceVectors('primitives', 'absent', root)).toBeUndefined();
  });

  it('finds a conformance file for every shipped primitive', () => {
    expect(conformanceFormatProblems(loadConformanceVectors('primitives', 'xor'))).toEqual([]);
  });
});

describe('conformanceFormatProblems', () => {
  it('accepts a well-formed file', () => expect(conformanceFormatProblems(valid)).toEqual([]));

  it('requires a file, a source and at least one case', () => {
    expect(conformanceFormatProblems(undefined)).toEqual(['no vectors/conformance.json']);
    expect(conformanceFormatProblems([])).toEqual(['the conformance file is not an object']);
    expect(conformanceFormatProblems({ source: '', cases: [] })).toEqual(['source must cite where the expected values come from', 'cases must hold at least one case']);
  });

  it('reports malformed cases', () => {
    const cases = [null, { name: '', params: 1, outputs: {} }, { name: 'x', params: {}, outputs: { a: 'ABC', b: 3 } }];
    expect(conformanceFormatProblems({ source: 's', cases })).toEqual([
      'cases[0] is not an object',
      'cases[1].name must be a non-empty string',
      'cases[1].params must be an object',
      'cases[1].outputs must name at least one output',
      'cases[2].outputs.a must be lowercase hex bytes',
      'cases[2].outputs.b must be lowercase hex bytes',
    ]);
  });
});

describe('outputProblems', () => {
  it('compares outputs as hex and reports missing keys', () => {
    expect(outputProblems({ result: [0x0a, 0x0b] }, { result: '0a0b' })).toEqual([]);
    expect(outputProblems({ result: [0x0a] }, { result: '0b', other: '00' })).toEqual(['output "result" is 0a, expected 0b', 'output "other" is missing']);
  });
});

describe('conformanceProblems', () => {
  const bundle = (bytes: number[]): TraceBundle => ({ schemaVersion: 1, producer: { kind: 'primitive', id: 'demo', apiVersion: 1 }, provenance: 'modeled', params: {}, facets: {}, output: { result: bytes } });
  const module: PrimitiveModule<{ a: string }> = {
    run: (params) => (params.a === 'bad' ? { ok: false, error: { key: 'plugin.demo.error' } } : { ok: true, trace: bundle([0x0a, 0x0b]) }),
  };

  it('passes when every case reproduces its outputs', () => expect(conformanceProblems(module, valid)).toEqual([]));

  it('prefixes mismatches and rejections with the case name', () => {
    const vectors = { source: 's', cases: [{ name: 'wrong', params: { a: '01' }, outputs: { result: 'ffff' } }, { name: 'rejected', params: { a: 'bad' }, outputs: { result: '00' } }] };
    expect(conformanceProblems(module, vectors)).toEqual(['wrong: output "result" is 0a0b, expected ffff', 'rejected: run() rejected params: {"key":"plugin.demo.error"}']);
  });
});
