import { describe, expect, it } from 'vitest';
import { isSupportedVersion, migrate } from './migrations.ts';
import { emptyProgress } from './schema.ts';

describe('migrate', () => {
  it.each([undefined, null, 'garbage', 7, [], {}, { version: '1' }, { version: 0 }, { version: 1.5 }])('turns %j into empty progress', (raw) => {
    expect(migrate(raw)).toEqual(emptyProgress());
  });

  it('returns empty progress for a future version', () => {
    expect(migrate({ version: 99, lessons: { a: { quiz: {} } } })).toEqual(emptyProgress());
  });

  it('validates a current-version record', () => {
    const record = { version: 1, lens: 'cryptographer', lessons: { a: { quiz: { '1': { solved: false, lastAnswer: 3 } } } } };
    expect(migrate(record)).toEqual(record);
  });
});

describe('isSupportedVersion', () => {
  it('accepts the current version only', () => {
    expect(isSupportedVersion({ version: 1 })).toBe(true);
    expect(isSupportedVersion({ version: 2 })).toBe(false);
    expect(isSupportedVersion({})).toBe(false);
    expect(isSupportedVersion('1')).toBe(false);
  });
});
