import { toHex } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { createKeccakHashContext, createKeccakXofContext } from './context.ts';
import { DOMAIN_SUFFIXES } from './padding.ts';
import { sponge } from './sponge.ts';

const RATE = 136;
const message = (length: number) => Uint8Array.from({ length }, (_, index) => (index * 31 + 7) & 0xff);
const sha3_256 = (data: Uint8Array) => toHex(sponge(data, RATE, DOMAIN_SUFFIXES.sha3, 32));
const newHash = () => createKeccakHashContext(RATE, DOMAIN_SUFFIXES.sha3, 32);
const newShake = (prefix = new Uint8Array(0)) => createKeccakXofContext(168, DOMAIN_SUFFIXES.shake, prefix);

describe('createKeccakHashContext', () => {
  it.each([0, 1, 135, 136, 137, 300])('equals the one-shot sponge for %i bytes fed in pieces of 1, 7 and 136', (length) => {
    const data = message(length);
    for (const piece of [1, 7, 136]) {
      const context = newHash();
      for (let offset = 0; offset < length; offset += piece) context.update(data.subarray(offset, offset + piece));
      expect(toHex(context.digest())).toBe(sha3_256(data));
    }
  });

  it('digest() leaves the context usable', () => {
    const context = newHash();
    context.update(message(10));
    const first = toHex(context.digest());
    expect(toHex(context.digest())).toBe(first);
    context.update(message(5));
    expect(toHex(context.digest())).toBe(sha3_256(Uint8Array.of(...message(10), ...message(5))));
  });

  it('clone() after a whole block is an independent midstate', () => {
    const source = newHash();
    source.update(message(RATE));
    const clone = source.clone();
    clone.update(Uint8Array.of(1));
    source.update(Uint8Array.of(2));
    expect(toHex(clone.digest())).toBe(sha3_256(Uint8Array.of(...message(RATE), 1)));
    expect(toHex(source.digest())).toBe(sha3_256(Uint8Array.of(...message(RATE), 2)));
  });
});

describe('createKeccakXofContext', () => {
  it('squeezes the same bytes in pieces as at once, across rate blocks', () => {
    const data = message(50);
    const whole = sponge(data, 168, DOMAIN_SUFFIXES.shake, 400);
    const context = newShake();
    context.update(data);
    const pieces = [context.squeeze(1), context.squeeze(167), context.squeeze(0), context.squeeze(232)];
    expect(pieces.map((piece) => toHex(piece)).join('')).toBe(toHex(whole));
  });

  it('absorbs the prefix first', () => {
    const context = newShake(message(3));
    context.update(message(4));
    expect(toHex(context.squeeze(32))).toBe(toHex(sponge(Uint8Array.of(...message(3), ...message(4)), 168, DOMAIN_SUFFIXES.shake, 32)));
  });

  it('refuses update after squeeze and a negative length', () => {
    const context = newShake();
    context.squeeze(1);
    expect(() => context.update(Uint8Array.of(1))).toThrow();
    expect(() => context.squeeze(-1)).toThrow(RangeError);
  });

  it('clone() copies an absorbing and a squeezing context independently', () => {
    const absorbing = newShake();
    absorbing.update(message(200));
    const copy = absorbing.clone();
    absorbing.update(Uint8Array.of(9));
    expect(toHex(copy.squeeze(16))).toBe(toHex(sponge(message(200), 168, DOMAIN_SUFFIXES.shake, 16)));
    const squeezing = newShake();
    const head = squeezing.squeeze(100);
    const fork = squeezing.clone();
    const tail = squeezing.squeeze(100);
    expect(toHex(fork.squeeze(100))).toBe(toHex(tail));
    expect(toHex(head) + toHex(tail)).toBe(toHex(sponge(new Uint8Array(0), 168, DOMAIN_SUFFIXES.shake, 200)));
  });
});
