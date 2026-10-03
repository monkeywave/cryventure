import { describe, expect, it } from 'vitest';
import { isPortName, PORT_NAMES } from './ports.ts';

describe('PORT_NAMES / isPortName', () => {
  it('lists every port', () => expect(PORT_NAMES).toEqual(['BlockCipher']));

  it('recognises port names only', () => {
    expect(isPortName('BlockCipher')).toBe(true);
    expect(isPortName('StreamCipher')).toBe(false);
    expect(isPortName(1)).toBe(false);
  });
});
