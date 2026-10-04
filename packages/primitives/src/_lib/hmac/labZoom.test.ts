import { describe, expect, it } from 'vitest';
import { HMAC_LAB_ID, hmacLabZoom, macLabZoom } from './labZoom.ts';
import { HMAC_LAB_MAX_KEY_BYTES, HMAC_LAB_MAX_MESSAGE_BYTES } from './manifestKit.ts';

const KEY = [0xab];
const MESSAGE = [0x01, 0x02];

describe('hmacLabZoom', () => {
  it('opens the hmac lab on exactly that call: hex key and message, full tag, no verify', () => {
    expect(hmacLabZoom('sha1:sha-1', KEY, Uint8Array.from(MESSAGE))).toEqual({
      producerId: HMAC_LAB_ID,
      params: { hash: 'sha1:sha-1', key: 'ab', encoding: 'hex', input: '0102', tagLength: 'full', expected: '' },
    });
  });

  it('links up to the key and message limits', () => {
    expect(hmacLabZoom('h:x', new Array<number>(HMAC_LAB_MAX_KEY_BYTES).fill(7), new Array<number>(HMAC_LAB_MAX_MESSAGE_BYTES).fill(9))).toBeDefined();
  });

  it('has no zoom past either limit', () => {
    expect(hmacLabZoom('h:x', new Array<number>(HMAC_LAB_MAX_KEY_BYTES + 1).fill(0), [])).toBeUndefined();
    expect(hmacLabZoom('h:x', [], new Array<number>(HMAC_LAB_MAX_MESSAGE_BYTES + 1).fill(0))).toBeUndefined();
  });

});

describe('macLabZoom', () => {
  it('uses the HMAC member\'s hash', () => {
    expect(macLabZoom({ construction: { kind: 'hmac', hash: 'sha256:sha-256' } }, KEY, MESSAGE)?.params['hash']).toBe('sha256:sha-256');
  });

  it('has no zoom for a member that is not an HMAC', () => {
    expect(macLabZoom({ construction: { kind: 'keyed-hash' } }, KEY, MESSAGE)).toBeUndefined();
  });
});
