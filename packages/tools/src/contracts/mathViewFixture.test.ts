import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { buildMathViewFixture, MATH_VIEW_FIXTURE } from './mathViewFixture.ts';

describe('math view fixture', () => {
  it('matches a fresh gf256 run (FIPS 197 §4.2 preset) and the gf256 catalog', async () => {
    const fixture = JSON.parse(readFileSync(join(REPO_ROOT, MATH_VIEW_FIXTURE), 'utf8')) as unknown;
    expect(fixture).toEqual(await buildMathViewFixture());
  });

  it('labels every key the math facet references, in every locale', async () => {
    const { labels } = await buildMathViewFixture();
    for (const messages of Object.values(labels)) for (const [key, text] of Object.entries(messages)) expect(text).not.toBe(key);
  });
});
