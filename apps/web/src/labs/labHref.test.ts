import { describe, expect, it } from 'vitest';
import { readLabLink } from './deepLink.ts';
import { createBlockLabHref, createLabHref, createLabLink, createLabTitle, labRoutePath } from './labHref.ts';
import { toyProducers } from './testProducers.ts';

const params = { keyHex: '000102030405060708090a0b0c0d0e0f', plaintextHex: '00112233445566778899aabbccddeeff', detail: 'op' };

describe('createLabLink', () => {
  it('links to the standalone lab with a deep link the lab reads back', () => {
    const href = createLabLink({ base: '/', lang: 'de' })('aes', params, 4);
    expect(href).toMatch(/^\/de\/lab\/aes\/#lab=aes&p=[\w-]+&s=4&v=1$/);
    const hash = href?.slice(href.indexOf('#')) ?? '';
    expect(readLabLink(hash, 'aes')).toEqual({ status: 'valid', state: { params, step: 4 } });
  });

  it('respects a sub-path base and leaves the step out when not given', () => {
    expect(createLabLink({ base: '/cryventure', lang: 'en' })('xor', { aHex: '00' })).toMatch(/^\/cryventure\/en\/lab\/xor\/#lab=xor&p=[\w-]+&v=1$/);
  });

  it('falls back to the default locale for an unsupported language', () => {
    expect(createLabLink({ base: '/', lang: 'fr' })('xor', {})).toMatch(/^\/en\/lab\/xor\//);
  });

  it('is undefined for an unregistered producer or an oversized hash', () => {
    const href = createLabLink({ base: '/', lang: 'en' });
    expect(href('ghost', {})).toBeUndefined();
    expect(href('xor', { aHex: '00'.repeat(2000) })).toBeUndefined();
  });

  it('builds the route path', () => {
    expect(labRoutePath('en', 'cbc')).toBe('en/lab/cbc/');
  });
});

describe('createLabHref (useLabActions().labHref)', () => {
  const zoom = { producerId: 'aes', params: { keyHex: params.keyHex, plaintextHex: params.plaintextHex, detail: 'op' } };

  it("links a view's zoom to the standalone lab with its params, in the deep-link format the lab reads back", () => {
    const href = createLabHref({ base: '/', lang: 'de' })(zoom);
    expect(href).toMatch(/^\/de\/lab\/aes\/#lab=aes&p=[\w-]+&v=1$/);
    expect(readLabLink(href?.slice(href.indexOf('#')) ?? '', 'aes')).toEqual({ status: 'valid', state: { params: zoom.params } });
  });

  it('respects the Pages base path', () => {
    expect(createLabHref({ base: '/cryventure/', lang: 'en' })(zoom)).toMatch(/^\/cryventure\/en\/lab\/aes\/#lab=aes&/);
  });

  it('is undefined for a producer outside the registry or params too long for a deep link', () => {
    const href = createLabHref({ base: '/', lang: 'en' });
    expect(href({ producerId: 'ghost', params: {} })).toBeUndefined();
    expect(href({ producerId: 'xor', params: { aHex: '00'.repeat(2000) } })).toBeUndefined();
  });

  it('looks producers up in the given registry', () => {
    const href = createLabHref({ base: '/', lang: 'en', producers: toyProducers });
    expect(href({ producerId: 'toy-mode', params: { cipher: 'toy' } })).toMatch(/^\/en\/lab\/toy-mode\/#lab=toy-mode&/);
    expect(href({ producerId: 'aes', params: {} })).toBeUndefined();
  });
});

describe('createBlockLabHref', () => {
  it('links into the cipher lab with the params its manifest names for the block', () => {
    const href = createBlockLabHref({ base: '/', lang: 'en' })('aes', params.keyHex, params.plaintextHex);
    expect(href).toMatch(/^\/en\/lab\/aes\/#lab=aes&p=[\w-]+&v=1$/);
    expect(readLabLink(href?.slice(href.indexOf('#')) ?? '', 'aes')).toEqual({ status: 'valid', state: { params } });
  });

  it('is undefined for a producer without blockLabParams or an unregistered one', () => {
    const href = createBlockLabHref({ base: '/', lang: 'en' });
    expect(href('xor', '00', '00')).toBeUndefined();
    expect(href('ghost', '00', '00')).toBeUndefined();
  });
});

describe('createLabTitle (useLabActions().labTitle)', () => {
  it("names a registered producer's lab by its manifest titleKey", () => {
    expect(createLabTitle()('hmac')).toBe('plugin.hmac.title');
    expect(createLabTitle(toyProducers)('toy-mode')).toBe(toyProducers.get('toy-mode')?.titleKey);
  });

  it('is undefined for a producer outside the registry', () => {
    expect(createLabTitle()('ghost')).toBeUndefined();
    expect(createLabTitle(toyProducers)('aes')).toBeUndefined();
  });
});
