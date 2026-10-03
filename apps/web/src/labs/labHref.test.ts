import { describe, expect, it } from 'vitest';
import { readLabLink } from './deepLink.ts';
import { createLabHref, labRoutePath } from './labHref.ts';

const params = { keyHex: '000102030405060708090a0b0c0d0e0f', plaintextHex: '00112233445566778899aabbccddeeff', detail: 'op' };

describe('createLabHref', () => {
  it('links to the standalone lab with a deep link the lab reads back', () => {
    const href = createLabHref({ base: '/', lang: 'de' })('aes', params, 4);
    expect(href).toMatch(/^\/de\/lab\/aes\/#lab=aes&p=[\w-]+&s=4&v=1$/);
    const hash = href?.slice(href.indexOf('#')) ?? '';
    expect(readLabLink(hash, 'aes')).toEqual({ status: 'valid', state: { params, step: 4 } });
  });

  it('respects a sub-path base and leaves the step out when not given', () => {
    expect(createLabHref({ base: '/cryventure', lang: 'en' })('xor', { aHex: '00' })).toMatch(/^\/cryventure\/en\/lab\/xor\/#lab=xor&p=[\w-]+&v=1$/);
  });

  it('falls back to the default locale for an unsupported language', () => {
    expect(createLabHref({ base: '/', lang: 'fr' })('xor', {})).toMatch(/^\/en\/lab\/xor\//);
  });

  it('is undefined for an unregistered producer or an oversized hash', () => {
    const href = createLabHref({ base: '/', lang: 'en' });
    expect(href('ghost', {})).toBeUndefined();
    expect(href('xor', { aHex: '00'.repeat(2000) })).toBeUndefined();
  });

  it('builds the route path', () => {
    expect(labRoutePath('en', 'cbc')).toBe('en/lab/cbc/');
  });
});
