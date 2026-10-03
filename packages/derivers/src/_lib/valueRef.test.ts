import { describe, expect, it } from 'vitest';
import { withValueRef } from './valueRef.ts';

describe('withValueRef', () => {
  it('attaches a valueRef, and adds no key without one', () => {
    expect(withValueRef({ reg: 'v0' }, 'key')).toEqual({ reg: 'v0', valueRef: 'key' });
    expect(Object.keys(withValueRef({ reg: 'v0' }, undefined))).toEqual(['reg']);
  });
});
