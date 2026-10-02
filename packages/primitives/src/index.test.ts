import { describe, expect, it } from 'vitest';
import { aesManifest } from './aes/manifest.ts';
import { collectManifests, primitiveManifests } from './index.ts';

describe('primitiveManifests', () => {
  it('discovers the AES manifest via import.meta.glob', () => {
    expect(primitiveManifests.map((manifest) => manifest.id)).toContain('aes');
    expect(primitiveManifests.find((manifest) => manifest.id === 'aes')).toBe(aesManifest);
  });
});

describe('collectManifests', () => {
  it('keeps primitive default exports, sorted by id', () => {
    const zeta = { ...aesManifest, id: 'zeta' };
    const modules = {
      './zeta/manifest.ts': { default: zeta },
      './aes/manifest.ts': { default: aesManifest },
      './x/manifest.ts': {},
      './v/manifest.ts': { default: { kind: 'view' } },
    };
    expect(collectManifests(modules).map((manifest) => manifest.id)).toEqual(['aes', 'zeta']);
  });
});
