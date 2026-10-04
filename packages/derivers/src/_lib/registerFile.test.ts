import { describe, expect, it } from 'vitest';
import { RegisterFile } from './registerFile.ts';

describe('RegisterFile', () => {
  it('reads what was written, and throws for an unwritten or forgotten register', () => {
    const file = new RegisterFile<number>();
    expect(() => file.read('v0')).toThrow('v0 is read before it is written');
    file.write('v0', 5);
    expect(file.read('v0')).toBe(5);
    file.forget('v0');
    expect(() => file.read('v0')).toThrow('v0 is read before it is written');
  });
});
