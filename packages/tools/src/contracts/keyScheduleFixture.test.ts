import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { buildKeyScheduleViewFixture, KEY_SCHEDULE_VIEW_FIXTURE } from './keyScheduleFixture.ts';

describe('key-schedule view fixture', () => {
  it('matches a fresh AES run (FIPS 197 App. B preset)', async () => {
    const fixture = JSON.parse(readFileSync(join(REPO_ROOT, KEY_SCHEDULE_VIEW_FIXTURE), 'utf8')) as unknown;
    expect(fixture).toEqual(await buildKeyScheduleViewFixture());
  });
});
