import { describe, expect, it } from 'vitest';
import { modeledStackFrame } from './stackFrame.ts';

const conventions = { frameBase: '0x7ffc5e3a1000', growsDown: true, frameAlign: 16 };

describe('modeledStackFrame', () => {
  it('places slots downward in declaration order, each aligned', () => {
    const addresses = modeledStackFrame(conventions, [
      { id: 'in', size: 16 },
      { id: 'out', size: 16 },
      { id: 'key', size: 244 },
    ]);
    expect(Object.fromEntries(addresses)).toEqual({ in: '0x7ffc5e3a0ff0', out: '0x7ffc5e3a0fe0', key: '0x7ffc5e3a0ee0' });
  });

  it('rounds an odd-sized slot down to the alignment', () => {
    const addresses = modeledStackFrame({ ...conventions, frameBase: '0x1008' }, [{ id: 'a', size: 3 }]);
    expect(addresses.get('a')).toBe('0x1000');
  });

  it('is deterministic', () => {
    const slots = [{ id: 'a', size: 5 }];
    expect(modeledStackFrame(conventions, slots)).toEqual(modeledStackFrame(conventions, slots));
  });

  it('rejects upward-growing stacks', () => {
    expect(() => modeledStackFrame({ ...conventions, growsDown: false }, [])).toThrow(/downward/);
  });
});
