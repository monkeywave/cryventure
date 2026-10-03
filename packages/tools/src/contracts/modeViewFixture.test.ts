import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { buildModeViewFixture, MODE_VIEW_FIXTURE } from './modeViewFixture.ts';

describe('mode view fixture (mode-chain, wire)', () => {
  it('matches fresh ecb/cbc/ctr runs and their catalogs', async () => {
    const fixture = JSON.parse(readFileSync(join(REPO_ROOT, MODE_VIEW_FIXTURE), 'utf8')) as unknown;
    expect(fixture).toEqual(await buildModeViewFixture());
  });
});
