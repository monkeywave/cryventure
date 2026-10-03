import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main, planScaffold, scaffold } from './cli.ts';

let root = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cv-scaffold-'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('planScaffold', () => {
  it('maps commands to folders and templates', () => {
    expect(planScaffold({ kind: 'primitive', id: 'a', family: 'hash' }).folder).toBe('packages/primitives/src/a');
    expect(planScaffold({ kind: 'view', id: 'b', requires: ['state'] }).files).toHaveLength(6);
    expect(planScaffold({ kind: 'deriver', id: 'c', from: ['state'], provides: 'demo-steps' })).toMatchObject({ folder: 'packages/derivers/src/c', files: expect.arrayContaining([expect.objectContaining({ path: 'packages/derivers/src/c/module.ts' })]) });
  });
});

describe('scaffold', () => {
  it('writes the plugin folder and refuses to overwrite it', () => {
    const written = scaffold({ kind: 'view', id: 'demo-bits', requires: ['state'] }, root);
    expect(written).toContain('packages/views/src/demo-bits/DemoBitsView.tsx');
    expect(readFileSync(join(root, 'packages/views/src/demo-bits/i18n/de.json'), 'utf8')).toContain('[DE] ');
    expect(() => scaffold({ kind: 'view', id: 'demo-bits', requires: ['state'] }, root)).toThrow('packages/views/src/demo-bits already exists; refusing to overwrite');
  });
});

describe('main', () => {
  it('scaffolds and logs created files', () => {
    const log = vi.fn();
    expect(main(['new', 'primitive', 'demo-xor'], root, log, vi.fn())).toBe(0);
    expect(existsSync(join(root, 'packages/primitives/src/demo-xor/module.ts'))).toBe(true);
    expect(log).toHaveBeenCalledWith('created packages/primitives/src/demo-xor/manifest.ts');
  });

  it('scaffolds a deriver', () => {
    const log = vi.fn();
    expect(main(['new', 'deriver', 'demo-trace', '--provides', 'demo-steps'], root, log, vi.fn())).toBe(0);
    expect(log).toHaveBeenCalledWith('created packages/derivers/src/demo-trace/i18n/de.json');
  });

  it('returns 1 with a message for bad arguments or existing folders', () => {
    const fail = vi.fn();
    expect(main(['new', 'primitive', 'Bad'], root, vi.fn(), fail)).toBe(1);
    expect(main(['new', 'primitive', 'ok'], root, vi.fn(), fail)).toBe(0);
    expect(main(['new', 'primitive', 'ok'], root, vi.fn(), fail)).toBe(1);
    expect(fail.mock.calls.map(([message]) => message)).toEqual(['id "Bad" must be kebab-case, e.g. demo-xor', 'packages/primitives/src/ok already exists; refusing to overwrite']);
  });
});
