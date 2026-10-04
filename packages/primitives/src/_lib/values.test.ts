import { describe, expect, it } from 'vitest';
import { nonEmptyValueRef } from './values.ts';

describe('nonEmptyValueRef', () => {
  it('is the one ValueRef of non-empty bytes, copied', () => {
    const bytes = [1, 2];
    const [ref] = nonEmptyValueRef('plugin.test', 'key', 'key', bytes, 3);
    expect(ref).toEqual({ id: 'key', labelKey: 'plugin.test.value.key', role: 'key', bytes: [1, 2], createdAt: 3 });
    expect(ref!.bytes).not.toBe(bytes);
  });

  it('is empty for empty or absent bytes', () => {
    expect(nonEmptyValueRef('plugin.test', 'key', 'key', [], 0)).toEqual([]);
    expect(nonEmptyValueRef('plugin.test', 'key', 'key', undefined, 0)).toEqual([]);
  });
});
