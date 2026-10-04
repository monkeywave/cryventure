import { i18nRef, toHex, type I18nRef } from '@cryventure/core';
import { IPAD, OPAD } from '../_lib/hmac/hmac.ts';
import { hashName, tagLengthBounds, type HmacComputation } from './hmacCompute.ts';

/** The narration of every HMAC step (`plugin.hmac.step.*`); each ref passes exactly its template's params. */
const NS = 'plugin.hmac';
const step = (name: string, params: Record<string, string | number>): I18nRef => i18nRef(`${NS}.step.${name}`, params);

/** Step −1: what is computed, B and L, and that the lab is no place for real keys (docs/M7.md §9). */
export function initialNarration({ hash, key, message, tag }: HmacComputation): I18nRef {
  return step('initial', { hash: hashName(hash.id), blockSize: hash.blockSize, outputLength: hash.outputSize, keyLength: key.length, messageLength: message.length, tagLength: tag.length });
}

/** K0 by branch: as is (|K| = B), zero-padded (|K| < B) or hashed first (|K| > B, RFC 2104 §2). */
export function keyPrepNarration({ branch, key, keyDigest, hash }: HmacComputation): I18nRef {
  if (branch === 'exact') return step('keyPrep.exact', { blockSize: hash.blockSize });
  if (branch === 'padded') return step('keyPrep.padded', { keyLength: key.length, blockSize: hash.blockSize, zeros: hash.blockSize - key.length });
  return step('keyPrep.hashed', { keyLength: key.length, blockSize: hash.blockSize, hash: hashName(hash.id), digest: toHex(keyDigest ?? []), zeros: hash.blockSize - hash.outputSize });
}

/** K0 ⊕ ipad / K0 ⊕ opad, with byte 0 worked out. */
export function padNarration({ hash, k0 }: HmacComputation, pad: 'ipad' | 'opad'): I18nRef {
  const byte = pad === 'ipad' ? IPAD : OPAD;
  const first = k0[0] ?? 0;
  const example = { pad: toHex([byte]), first: toHex([first]), result: toHex([first ^ byte]) };
  return pad === 'ipad' ? step('ipad', { ...example, blockSize: hash.blockSize }) : step('opad', example);
}

/** The pad block processed: the midstate when the hash shows its chaining state. */
export function blockNarration(computation: HmacComputation, half: 'inner' | 'outer'): I18nRef {
  const midstate = computation[half].midstate;
  const name = half === 'inner' ? 'innerBlock' : 'outerBlock';
  const hash = hashName(computation.hash.id);
  return midstate === undefined ? step(`${name}.noMidstate`, { hash }) : step(`${name}.midstate`, { hash, stateLength: midstate.length });
}

export function innerMessageNarration({ message, inner }: HmacComputation): I18nRef {
  return step('innerMessage', { messageLength: message.length, inner: toHex(inner.digest) });
}

export function outerNarration({ hash, outer }: HmacComputation): I18nRef {
  return step('outer', { outputLength: hash.outputSize, digest: toHex(outer.digest) });
}

export function truncateNarration({ hash, tag }: HmacComputation): I18nRef {
  return step('truncate', { tagLength: tag.length, outputLength: hash.outputSize, min: tagLengthBounds(hash.outputSize).min, tag: toHex(tag) });
}

/** PASS, FAIL or a length mismatch, and why the comparison loop never exits early. */
export function verifyNarration({ comparison, tag }: HmacComputation): I18nRef {
  const steps = comparison?.steps ?? [];
  const expectedLength = steps.length;
  if (comparison?.lengthsMatch !== true) return step('verify.lengthMismatch', { expectedLength, tagLength: tag.length });
  const accumulator = toHex([steps.at(-1)?.accumulator ?? 0]);
  if (comparison.equal) return step('verify.pass', { expectedLength, accumulator });
  return step('verify.fail', { expectedLength, accumulator, differences: steps.filter((entry) => entry.difference !== 0).length });
}
