import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { buildModeViewFixture, MODE_VIEW_FIXTURES } from './modeViewFixture.ts';

describe('mode view fixtures (mode-chain, wire)', () => {
  it.each(['chain', 'wire'] as const)('the %s fixture matches fresh ecb/cbc/ctr runs and their catalogs', async (kind) => {
    const fixture = JSON.parse(readFileSync(join(REPO_ROOT, MODE_VIEW_FIXTURES[kind]), 'utf8')) as unknown;
    expect(fixture).toEqual(kind === 'chain' ? await buildModeViewFixture('chain') : await buildModeViewFixture('wire'));
  });
});
