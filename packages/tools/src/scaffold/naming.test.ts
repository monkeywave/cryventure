import { describe, expect, it } from 'vitest';
import { isKebabCase, toCamelCase, toConstantCase, toPascalCase } from './naming.ts';

describe('isKebabCase', () => {
  it.each(['aes', 'demo-xor', 'sha2-256', 'x25519'])('accepts %s', (id) => expect(isKebabCase(id)).toBe(true));
  it.each(['', 'Demo', 'demo_xor', '-a', 'a-', 'a--b', '2fish', 'a b'])('rejects %j', (id) => expect(isKebabCase(id)).toBe(false));
});

describe('case conversions', () => {
  it('converts kebab-case ids', () => {
    expect(toPascalCase('demo-xor')).toBe('DemoXor');
    expect(toCamelCase('demo-xor')).toBe('demoXor');
    expect(toConstantCase('demo-xor')).toBe('DEMO_XOR');
    expect(toPascalCase('aes')).toBe('Aes');
  });
});
