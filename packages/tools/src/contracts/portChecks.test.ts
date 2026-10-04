import { createHash } from 'node:crypto';
import type { BlockCipher, HashContext, HashFamily, HashFunction, MacContext, MacFamily, MacFunction, MacOptions, ParamField, PrimitiveManifest, XofContext, XofCustomization, XofFunction } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { blockCipherProblems, hashFamilyProblems, implementedPortProblems, macFamilyProblems, portFieldProblems, portMemberProblems, runInProblems, textFieldProblems } from './portChecks.ts';

/** 4-byte toy cipher: E(k, b) = b ⊕ k, with the length checks a real port must have. */
function toyCipher(overrides: Partial<BlockCipher> = {}): BlockCipher {
  const xor = (key: Uint8Array, block: Uint8Array): Uint8Array => {
    if (key.length !== 4 || block.length !== 4) throw new RangeError('toy: wrong length');
    return block.map((byte, i) => byte ^ (key[i] ?? 0));
  };
  return { id: 'toy', blockSize: 4, keySizes: [4], encryptBlock: xor, decryptBlock: xor, ...overrides };
}

describe('blockCipherProblems', () => {
  it('passes a sane cipher', () => expect(blockCipherProblems(toyCipher(), 'toy')).toEqual([]));

  it('reports a foreign id and bad sizes', () => {
    expect(blockCipherProblems(toyCipher({ id: 'aes' }), 'toy')).toEqual(['BlockCipher: id "aes" is not the producer id "toy"']);
    expect(blockCipherProblems(toyCipher({ blockSize: 0 }), 'toy')[0]).toBe('BlockCipher: blockSize 0 is not a positive integer');
    expect(blockCipherProblems(toyCipher({ keySizes: [] }), 'toy')).toEqual(['BlockCipher: keySizes is empty']);
  });

  it('reports a broken round trip', () => {
    const broken = toyCipher({ decryptBlock: (key, block) => toyCipher().decryptBlock(key, block).map((byte) => byte ^ 1) });
    expect(blockCipherProblems(broken, 'toy')).toEqual(['BlockCipher: decrypt(encrypt(block)) differs from block for a 4-byte key']);
  });

  it('reports wrong lengths that do not throw', () => {
    const lenient = toyCipher({ encryptBlock: (_key, block) => block, decryptBlock: (_key, block) => block });
    expect(blockCipherProblems(lenient, 'toy')).toEqual([
      'BlockCipher: encryptBlock accepts a 1-byte key',
      'BlockCipher: decryptBlock accepts a 1-byte key',
      'BlockCipher: encryptBlock accepts a 5-byte block',
      'BlockCipher: decryptBlock accepts a 5-byte block',
    ]);
  });

  it('reports a cipher that throws on valid input', () => {
    const throwing = toyCipher({ encryptBlock: () => { throw new Error('boom'); } });
    expect(blockCipherProblems(throwing, 'toy')).toEqual(['BlockCipher: round trip with a 4-byte key threw: boom']);
  });
});

/** A buffering context over a one-shot `hash` (fine for a toy; real ports compress as they go). */
function bufferingContext(hash: (data: Uint8Array) => Uint8Array, absorbed: readonly number[] = []): HashContext {
  const bytes = [...absorbed];
  return {
    update: (data) => { bytes.push(...data); },
    digest: () => hash(Uint8Array.from(bytes)),
    clone: () => bufferingContext(hash, bytes),
  };
}

/** Toy hash: folds the input (and its length) into `outputSize` bytes; its context follows any `hash` override. */
function toyHash(overrides: Partial<HashFunction> = {}): HashFunction {
  const base: Omit<HashFunction, 'create'> = {
    id: 'toy-256',
    blockSize: 64,
    outputSize: 32,
    hash(data) {
      const digest = new Uint8Array(this.outputSize).fill(data.length & 0xff);
      data.forEach((byte, i) => { digest[i % digest.length]! ^= byte; });
      return digest;
    },
  };
  const fn: HashFunction = { ...base, create: () => bufferingContext((data) => fn.hash(data)), ...overrides };
  return fn;
}

const toyFamily = (functions: HashFunction[] = [toyHash(), toyHash({ id: 'toy-224', outputSize: 28 })], id = 'toy'): HashFamily => ({ id, functions });

describe('hashFamilyProblems', () => {
  it('passes a sane family', () => expect(hashFamilyProblems(toyFamily(), 'toy')).toEqual([]));

  it('accepts a 128-byte block', () => expect(hashFamilyProblems(toyFamily([toyHash({ id: 'toy-512', blockSize: 128, outputSize: 64 })]), 'toy')).toEqual([]));

  it('reports a family id that is not the producer id', () => {
    expect(hashFamilyProblems(toyFamily(undefined, 'sha256'), 'toy')).toEqual(['Hash: family id "sha256" is not the producer id "toy"']);
  });

  it('reports an empty family', () => expect(hashFamilyProblems(toyFamily([]), 'toy')).toEqual(['Hash: functions is empty']));

  it('reports duplicate function ids', () => {
    expect(hashFamilyProblems(toyFamily([toyHash(), toyHash(), toyHash()]), 'toy')).toEqual(['Hash: function id "toy-256" is not unique']);
  });

  it('accepts any positive block size, e.g. the 136-byte rate of SHA3-256', () => {
    expect(hashFamilyProblems(toyFamily([toyHash({ id: 'toy-sha3', blockSize: 136 })]), 'toy')).toEqual([]);
  });

  it('reports a block size that is not a positive integer', () => {
    expect(hashFamilyProblems(toyFamily([toyHash({ blockSize: 0 })]), 'toy')).toEqual(['Hash toy-256: blockSize 0 is not a positive integer']);
    expect(hashFamilyProblems(toyFamily([toyHash({ blockSize: 1.5 })]), 'toy')).toEqual(['Hash toy-256: blockSize 1.5 is not a positive integer']);
  });

  it('reports a bad output size', () => {
    expect(hashFamilyProblems(toyFamily([toyHash({ outputSize: 0 })]), 'toy')).toEqual(['Hash toy-256: outputSize 0 is not a positive integer']);
  });

  it('reports digests of the wrong length, per input length', () => {
    const short = toyHash({ hash: (data) => new Uint8Array(data.length === 1 ? 31 : 32) });
    expect(hashFamilyProblems(toyFamily([short]), 'toy')).toEqual(['Hash toy-256: 1-byte input: digest is not 32 bytes']);
    const blockOnly = toyHash({ hash: (data) => new Uint8Array(data.length === 64 ? 16 : 32) });
    expect(hashFamilyProblems(toyFamily([blockOnly]), 'toy')).toEqual(['Hash toy-256: 64-byte input: digest is not 32 bytes']);
  });

  it('reports a non-deterministic function', () => {
    let calls = 0;
    const drifting = toyHash({ hash: () => new Uint8Array(32).fill(calls++) });
    expect(hashFamilyProblems(toyFamily([drifting]), 'toy')).toEqual([
      'Hash toy-256: 0-byte input: hash is not deterministic',
      'Hash toy-256: 1-byte input: hash is not deterministic',
      'Hash toy-256: 64-byte input: hash is not deterministic',
    ]);
  });

  it('reports a function that throws', () => {
    const throwing = toyHash({ hash: (data) => { if (data.length === 0) throw new Error('empty'); return new Uint8Array(32); } });
    expect(hashFamilyProblems(toyFamily([throwing]), 'toy')).toEqual(['Hash toy-256: 0-byte input threw: empty']);
  });

  it('reports a function whose digests of the 0-, 1- and block-sized inputs collide', () => {
    const constant = toyHash({ hash: () => new Uint8Array(32) });
    expect(hashFamilyProblems(toyFamily([constant]), 'toy')).toEqual([
      'Hash toy-256: 0-byte and 1-byte inputs have the same digest',
      'Hash toy-256: 0-byte and 64-byte inputs have the same digest',
      'Hash toy-256: 1-byte and 64-byte inputs have the same digest',
    ]);
    const lengthOnly = toyHash({ hash: (data) => new Uint8Array(32).fill(data.length === 1 ? 1 : 0) });
    expect(hashFamilyProblems(toyFamily([lengthOnly]), 'toy')).toEqual(['Hash toy-256: 0-byte and 64-byte inputs have the same digest']);
  });

  it('reports a function that mutates its input', () => {
    const mutating = toyHash({ hash(data) { const digest = toyHash().hash(data); data.fill(0xaa); return digest; } });
    expect(hashFamilyProblems(toyFamily([mutating]), 'toy')).toEqual(['Hash toy-256: 1-byte input: hash mutates its input', 'Hash toy-256: 64-byte input: hash mutates its input']);
  });

  it('is the sanity check implementedPortProblems runs for Hash', () => {
    expect(implementedPortProblems({ id: 'toy', implements: ['Hash'] }, { ports: { Hash: toyFamily() } })).toEqual([]);
    expect(implementedPortProblems({ id: 'other', implements: ['Hash'] }, { ports: { Hash: toyFamily() } })).toEqual(['Hash: family id "toy" is not the producer id "other"']);
  });
});

/** Toy XOF stream: byte i of the output for a seed folded from N, S and the data. */
const toyStream = (seed: number, from: number, length: number): Uint8Array => Uint8Array.from({ length }, (_, i) => (seed * 31 + (from + i) * 7 + ((from + i) >> 3)) & 0xff);
const fold = (seed: number, bytes: Uint8Array | undefined): number => Array.from(bytes ?? []).reduce((acc, byte) => (acc * 33 + byte + 1) % 65_521, seed);
const isEmpty = (custom: XofCustomization | undefined): boolean => (custom?.functionName?.length ?? 0) === 0 && (custom?.customization?.length ?? 0) === 0;

/** The seed of a toy XOF: cSHAKE-like with N/S folded in only when non-empty, so empty N and S equal SHAKE. */
function toySeed(securityBits: number, data: Uint8Array, custom: XofCustomization | undefined): number {
  const domain = isEmpty(custom) ? securityBits : fold(fold(securityBits + 1, custom?.functionName), custom?.customization);
  return fold(domain, data);
}

function toyXofContext(securityBits: number, custom: XofCustomization | undefined, state = { bytes: [] as number[], position: -1 }): XofContext {
  return {
    update(data) {
      if (state.position >= 0) throw new Error('toy: update after squeeze');
      state.bytes.push(...data);
    },
    squeeze(length) {
      state.position = Math.max(state.position, 0);
      const out = toyStream(toySeed(securityBits, Uint8Array.from(state.bytes), custom), state.position, length);
      state.position += length;
      return out;
    },
    clone: () => toyXofContext(securityBits, custom, { bytes: [...state.bytes], position: state.position }),
  };
}

function toyXof(overrides: Partial<XofFunction> = {}): XofFunction {
  const base = { id: 'toyshake128', blockSize: 168, securityBits: 128, customizable: false };
  const xof: XofFunction = {
    ...base,
    xof: (data, outputLength, custom) => {
      if (!xof.customizable && !isEmpty(custom)) throw new Error('toy: not customizable');
      return toyStream(toySeed(xof.securityBits, data, custom), 0, outputLength);
    },
    create: (custom) => {
      if (!xof.customizable && !isEmpty(custom)) throw new Error('toy: not customizable');
      return toyXofContext(xof.securityBits, custom);
    },
    ...overrides,
  };
  return xof;
}

const toyCshake = (overrides: Partial<XofFunction> = {}): XofFunction => toyXof({ id: 'toycshake128', customizable: true, ...overrides });
const xofFamily = (xofs: XofFunction[]): HashFamily => ({ id: 'toy', functions: [toyHash()], xofs });

describe('hashFamilyProblems: incremental contexts', () => {
  it('passes a context that matches hash()', () => expect(hashFamilyProblems(toyFamily([toyHash({ blockSize: 5 })]), 'toy')).toEqual([]));

  it('reports a missing create()', () => {
    const { create: _create, ...noCreate } = toyHash();
    expect(hashFamilyProblems(toyFamily([noCreate as HashFunction]), 'toy')).toEqual(['Hash toy-256: create is not a function']);
  });

  it('reports a context that drops a short first update', () => {
    const forgetful = toyHash({
      create() {
        const inner = bufferingContext((data) => toyHash().hash(data));
        let first = true;
        const update = (data: Uint8Array): void => {
          const dropped = first && data.length > 0 && data.length < 64;
          if (data.length > 0) first = false;
          if (!dropped) inner.update(data);
        };
        return { ...inner, update };
      },
    });
    expect(hashFamilyProblems(toyFamily([forgetful]), 'toy')).toEqual([
      'Hash toy-256: create() + update (1 | n−1, 131 bytes) differs from hash()',
      'Hash toy-256: create() + update (byte by byte, 65 bytes) differs from hash()',
      'Hash toy-256: digest() stops a later update from counting',
    ]);
  });

  it('reports digest() that consumes the context (finalising in place)', () => {
    const finalising = toyHash({
      create() {
        let bytes: number[] = [];
        const context: HashContext = {
          update: (data) => { bytes.push(...data); },
          digest: () => { const digest = toyHash().hash(Uint8Array.from(bytes)); bytes = [0x80]; return digest; },
          clone: () => context,
        };
        return context;
      },
    });
    const problems = hashFamilyProblems(toyFamily([finalising]), 'toy');
    expect(problems).toContain('Hash toy-256: digest() twice gives different bytes');
    expect(problems).toContain('Hash toy-256: clone() is not independent of its source');
  });

  it('reports a clone that shares its source’s state', () => {
    const sharing = toyHash({
      create() {
        const context = bufferingContext((data) => toyHash().hash(data));
        return { ...context, clone: () => context };
      },
    });
    expect(hashFamilyProblems(toyFamily([sharing]), 'toy')).toEqual(['Hash toy-256: clone() is not independent of its source']);
  });

  it('reports a context that throws', () => {
    const throwing = toyHash({ create: () => { throw new Error('no context'); } });
    expect(hashFamilyProblems(toyFamily([throwing]), 'toy')).toEqual([
      'Hash toy-256: create() + update (0 | n, 131 bytes) threw: no context',
      'Hash toy-256: create() + update (1 | n−1, 131 bytes) threw: no context',
      'Hash toy-256: create() + update (block-aligned, 131 bytes) threw: no context',
      'Hash toy-256: create() + update (byte by byte, 65 bytes) threw: no context',
      'Hash toy-256: digest() threw: no context',
      'Hash toy-256: clone() threw: no context',
    ]);
  });
});

describe('hashFamilyProblems: XOFs', () => {
  it('passes a sane SHAKE/cSHAKE pair', () => {
    expect(hashFamilyProblems(xofFamily([toyXof(), toyCshake(), toyXof({ id: 'toyshake256', securityBits: 256, blockSize: 136 })]), 'toy')).toEqual([]);
  });

  it('reports ids that are not unique across functions and XOFs', () => {
    expect(hashFamilyProblems(xofFamily([toyXof({ id: 'toy-256' })]), 'toy')).toEqual(['Hash: function id "toy-256" is not unique']);
  });

  it('reports bad sizes', () => {
    expect(hashFamilyProblems(xofFamily([toyXof({ blockSize: 0 })]), 'toy')).toEqual(['Hash toyshake128: blockSize 0 is not a positive integer']);
    expect(hashFamilyProblems(xofFamily([toyXof({ securityBits: -1 })]), 'toy')).toEqual(['Hash toyshake128: securityBits -1 is not a positive integer']);
  });

  it('reports a squeeze that restarts the stream', () => {
    const testInput = Uint8Array.from({ length: 169 }, (_, i) => (i * 31 + 5) & 0xff);
    const restarting = toyXof({ create: () => ({ ...toyXofContext(128, undefined), squeeze: (length) => toyStream(toySeed(128, testInput, undefined), 0, length) }) });
    expect(hashFamilyProblems(xofFamily([restarting]), 'toy')).toContain('Hash toyshake128: squeeze(167) ‖ squeeze(170) differs from xof(m, 337)');
  });

  it('reports xof output of the wrong length', () => {
    const short = toyXof({ xof: (_data, length) => new Uint8Array(length - 1) });
    expect(hashFamilyProblems(xofFamily([short]), 'toy')).toContain('Hash toyshake128: xof(m, 337) is not 337 bytes');
  });

  it('reports update after squeeze that does not throw, and a shared clone', () => {
    const lenient = toyXof({
      create: () => {
        const bytes: number[] = [];
        const context: XofContext = { update: (data) => { bytes.push(...data); }, squeeze: (length) => toyStream(toySeed(128, Uint8Array.from(bytes), undefined), 0, length), clone: () => context };
        return context;
      },
    });
    const problems = hashFamilyProblems(xofFamily([lenient]), 'toy');
    expect(problems).toContain('Hash toyshake128: context: clone() is not independent of its source');
    expect(problems).toContain('Hash toyshake128: context: update after squeeze does not throw');
  });

  it('reports a clone taken mid-squeeze that shares the squeeze position (the old pre-squeeze check let it pass)', () => {
    const sharedSqueeze = (custom: XofCustomization | undefined, state = { bytes: [] as number[], position: -1 }): XofContext => ({
      ...toyXofContext(128, custom, state),
      clone: () => (state.position >= 0 ? sharedSqueeze(custom, state) : sharedSqueeze(custom, { bytes: [...state.bytes], position: state.position })),
    });
    const sharing = toyXof({ create: (custom) => { if (!isEmpty(custom)) throw new Error('toy: not customizable'); return sharedSqueeze(custom); } });
    expect(hashFamilyProblems(xofFamily([sharing]), 'toy')).toEqual([
      'Hash toyshake128: context: a clone taken mid-squeeze changes when its source squeezes on',
      'Hash toyshake128: context: a source changes when its mid-squeeze clone squeezes on',
    ]);
  });

  it('reports a customizable XOF whose create() ignores a non-empty N or S', () => {
    const ignoring = toyCshake({ create: () => toyXofContext(128, undefined) });
    expect(hashFamilyProblems(xofFamily([toyXof(), ignoring]), 'toy')).toEqual([
      'Hash toycshake128: create(N) + update differs from xof(m, 32, N)',
      'Hash toycshake128: create(S) + update differs from xof(m, 32, S)',
    ]);
  });

  it('reports a non-customizable XOF that accepts N or S, or a non-boolean flag', () => {
    const permissive = toyXof({ xof: (data, outputLength) => toyStream(toySeed(128, data, undefined), 0, outputLength) });
    expect(hashFamilyProblems(xofFamily([permissive]), 'toy')).toEqual(['Hash toyshake128: is not customizable but accepts a non-empty N or S']);
    expect(hashFamilyProblems(xofFamily([toyXof({ customizable: 'no' as unknown as boolean })]), 'toy')).toEqual(['Hash toyshake128: customizable is not a boolean']);
  });

  it('reports a non-customizable XOF that rejects empty N and S', () => {
    const strict = toyXof({ xof: (data, outputLength, custom) => { if (custom !== undefined) throw new Error('no custom at all'); return toyStream(toySeed(128, data, undefined), 0, outputLength); } });
    expect(hashFamilyProblems(xofFamily([strict]), 'toy')).toEqual(['Hash toyshake128: empty N and S threw: no custom at all']);
  });

  it('reports a cSHAKE whose empty N and S differ from the SHAKE of the same strength', () => {
    const offDomain = toyCshake({ xof: (data, outputLength) => toyStream(toySeed(999, data, undefined), 0, outputLength) });
    expect(hashFamilyProblems(xofFamily([toyXof(), offDomain]), 'toy')).toContain('Hash toycshake128: with empty N and S differs from toyshake128');
    expect(hashFamilyProblems(xofFamily([toyXof({ securityBits: 256 }), offDomain]), 'toy')).not.toContain('Hash toycshake128: with empty N and S differs from toyshake128');
  });
});

const sha256 = (data: Uint8Array): Uint8Array => new Uint8Array(createHash('sha256').update(data).digest());
const concat = (...parts: Uint8Array[]): Uint8Array => Uint8Array.from(parts.flatMap((part) => [...part]));

/** A buffering MAC context over a one-shot `tag` (fine for a test; real ports keep midstates). */
function bufferingMacContext(tag: (data: Uint8Array) => Uint8Array, absorbed: readonly number[] = []): MacContext {
  const bytes = [...absorbed];
  return { update: (data) => { bytes.push(...data); }, mac: () => tag(Uint8Array.from(bytes)), clone: () => bufferingMacContext(tag, bytes) };
}

/** RFC 2104 key preparation: hash a key longer than B, then zero-pad to B. `truncate` instead cuts it (the bug the long-key check catches). */
function hmacKeyBlock(key: Uint8Array, truncate = false): Uint8Array {
  const block = new Uint8Array(64);
  block.set(key.length > 64 ? (truncate ? key.subarray(0, 64) : sha256(key)) : key);
  return block;
}

const hmacTag = (key: Uint8Array, data: Uint8Array, truncate = false): Uint8Array => {
  const block = hmacKeyBlock(key, truncate);
  return sha256(concat(block.map((byte) => byte ^ 0x5c), sha256(concat(block.map((byte) => byte ^ 0x36), data))));
};

function rejectOptions(options: MacOptions | undefined): void {
  if (options?.customization !== undefined || options?.outputLength !== undefined) throw new RangeError('test hmac: no options');
}

/** A fake HMAC-SHA-256 (test only); overrides replace any member. */
function testHmac(overrides: Partial<MacFunction> = {}): MacFunction {
  const fn: MacFunction = {
    id: 'hmac-toy-256',
    outputSize: 32,
    blockSize: 64,
    keySizes: { min: 0 },
    customizable: false,
    variableOutput: false,
    construction: { kind: 'hmac', hash: 'toy:toy-256' },
    mac: (key, data, options) => { rejectOptions(options); return hmacTag(key, data); },
    create: (key, options) => { rejectOptions(options); const copy = key.slice(); return bufferingMacContext((data) => fn.mac(copy, data)); },
    ...overrides,
  };
  return fn;
}

/** A fake KMAC-like function: SHAKE256 over S ‖ key ‖ data, with 1..32-byte keys and a variable output length. */
function testKmac(overrides: Partial<MacFunction> = {}): MacFunction {
  const checkKey = (key: Uint8Array): void => { if (key.length < 1 || key.length > 32) throw new RangeError('test kmac: key length'); };
  const tag = (key: Uint8Array, data: Uint8Array, options?: MacOptions): Uint8Array =>
    new Uint8Array(createHash('shake256', { outputLength: options?.outputLength ?? 64 }).update(concat(options?.customization ?? new Uint8Array(0), key, data)).digest());
  return {
    id: 'kmac-toy',
    outputSize: 64,
    blockSize: 136,
    keySizes: { min: 1, max: 32 },
    customizable: true,
    variableOutput: true,
    construction: { kind: 'kmac' },
    mac: (key, data, options) => { checkKey(key); return tag(key, data, options); },
    create: (key, options) => { checkKey(key); const copy = key.slice(); return bufferingMacContext((data) => tag(copy, data, options)); },
    ...overrides,
  };
}

const macFamily = (functions: MacFunction[] = [testHmac()], id = 'toy'): MacFamily => ({ id, functions });

describe('macFamilyProblems', () => {
  it('passes a sane HMAC and a sane customizable, variable-length MAC', () => {
    expect(macFamilyProblems(macFamily([testHmac(), testKmac()]), 'toy')).toEqual([]);
  });

  it('reports a foreign family id, an empty family and duplicate ids', () => {
    expect(macFamilyProblems(macFamily(undefined, 'sha256'), 'toy')).toEqual(['Mac: family id "sha256" is not the producer id "toy"']);
    expect(macFamilyProblems(macFamily([]), 'toy')).toEqual(['Mac: functions is empty']);
    expect(macFamilyProblems(macFamily([testHmac(), testHmac()]), 'toy')).toEqual(['Mac: function id "hmac-toy-256" is not unique']);
  });

  it('reports bad sizes, key sizes, flags and constructions', () => {
    expect(macFamilyProblems(macFamily([testHmac({ outputSize: 0, blockSize: 1.5 })]), 'toy')).toEqual([
      'Mac hmac-toy-256: outputSize 0 is not a positive integer',
      'Mac hmac-toy-256: blockSize 1.5 is not a positive integer',
    ]);
    expect(macFamilyProblems(macFamily([testHmac({ keySizes: { min: -1 } })]), 'toy')).toEqual(['Mac hmac-toy-256: keySizes.min -1 is not a non-negative integer']);
    expect(macFamilyProblems(macFamily([testHmac({ keySizes: { min: 8, max: 4 } })]), 'toy')).toEqual(['Mac hmac-toy-256: keySizes.max 4 is not an integer ≥ min']);
    expect(macFamilyProblems(macFamily([testHmac({ customizable: 'no' as unknown as boolean })]), 'toy')).toEqual(['Mac hmac-toy-256: customizable or variableOutput is not a boolean']);
    expect(macFamilyProblems(macFamily([testHmac({ construction: { kind: 'cmac' } as never })]), 'toy')).toEqual(['Mac hmac-toy-256: construction kind "cmac" is not hmac, kmac or keyed-hash']);
    expect(macFamilyProblems(macFamily([testHmac({ construction: { kind: 'hmac', hash: 'sha-256' } })]), 'toy')).toEqual(['Mac hmac-toy-256: hmac construction hash "sha-256" is not a member ref']);
  });

  it('reports tags of the wrong length, per key and message length', () => {
    const short = testHmac({ mac: (key, data) => hmacTag(key, data).subarray(data.length === 1 ? 1 : 0) });
    expect(macFamilyProblems(macFamily([short]), 'toy')).toEqual([
      'Mac hmac-toy-256: 0-byte key, 1-byte message: tag is not 32 bytes',
      'Mac hmac-toy-256: 1-byte key, 1-byte message: tag is not 32 bytes',
      'Mac hmac-toy-256: 64-byte key, 1-byte message: tag is not 32 bytes',
      'Mac hmac-toy-256: 65-byte key, 1-byte message: tag is not 32 bytes',
    ]);
  });

  it('reports a non-deterministic or mutating mac, and one that throws on valid input', () => {
    let calls = 0;
    const drifting = testHmac({ keySizes: { min: 1, max: 1 }, mac: (key, data) => hmacTag(key, concat(data, Uint8Array.of(calls++))) });
    expect(macFamilyProblems(macFamily([drifting]), 'toy')).toHaveLength(4);
    expect(macFamilyProblems(macFamily([drifting]), 'toy')[0]).toBe('Mac hmac-toy-256: 1-byte key, 0-byte message: mac is not deterministic');
    const mutating = testHmac({ keySizes: { min: 1, max: 1 }, mac: (key, data) => { const tag = hmacTag(key, data); key.fill(0); return tag; } });
    expect(macFamilyProblems(macFamily([mutating]), 'toy')[0]).toBe('Mac hmac-toy-256: 1-byte key, 0-byte message: mac mutates its key or message');
    const throwing = testHmac({ keySizes: { min: 1, max: 1 }, mac: () => { throw new Error('boom'); } });
    expect(macFamilyProblems(macFamily([throwing]), 'toy')[0]).toBe('Mac hmac-toy-256: 1-byte key, 0-byte message threw: boom');
  });

  it('reports a context that disagrees with mac(), and a shared clone', () => {
    const keyless = testHmac({ keySizes: { min: 1, max: 1 }, create: () => bufferingMacContext((data) => hmacTag(new Uint8Array(1), data)) });
    expect(macFamilyProblems(macFamily([keyless]), 'toy')).toContain('Mac hmac-toy-256 (1-byte key): create(key) + update (0 | n, 131 bytes) differs from mac(key, m)');
    const sharing = testHmac({ create: (key, options) => { const context = testHmac().create(key, options); return { ...context, clone: () => context }; } });
    expect(macFamilyProblems(macFamily([sharing]), 'toy')).toEqual([0, 1, 64, 65].map((length) => `Mac hmac-toy-256 (${length}-byte key): clone() is not independent of its source`));
  });

  it('reports a key outside keySizes that does not throw a RangeError', () => {
    const lenient = testKmac({ mac: (key, data) => testKmac().mac(Uint8Array.of(1), concat(key, data)), create: (key) => testKmac().create(key.length === 0 ? Uint8Array.of(1) : key) });
    const problems = macFamilyProblems(macFamily([lenient]), 'toy');
    expect(problems).toContain('Mac kmac-toy: mac does not throw a RangeError for a 0-byte key');
    expect(problems).toContain('Mac kmac-toy: create does not throw a RangeError for a 0-byte key');
    expect(problems).toContain('Mac kmac-toy: mac does not throw a RangeError for a 33-byte key');
    const plainError = testKmac({ create: (key, options) => { if (key.length === 0) throw new Error('not a RangeError'); return testKmac().create(key, options); } });
    expect(macFamilyProblems(macFamily([plainError]), 'toy')).toEqual(['Mac kmac-toy: create does not throw a RangeError for a 0-byte key']);
  });

  it('reports options a function accepts without supporting them, and an ignored output length', () => {
    const permissive = testHmac({ mac: (key, data) => hmacTag(key, data), create: (key) => bufferingMacContext((data) => hmacTag(key, data)) });
    expect(macFamilyProblems(macFamily([permissive]), 'toy')).toEqual([
      'Mac hmac-toy-256: accepts a customization it does not support',
      'Mac hmac-toy-256: accepts an outputLength it does not support',
    ]);
    const fixed = testKmac({ mac: (key, data, options) => testKmac().mac(key, data, { ...options, outputLength: 64 }) });
    expect(macFamilyProblems(macFamily([fixed]), 'toy')).toContain('Mac kmac-toy: outputLength 65 is not honoured');
  });

  it('reports an HMAC that truncates a key longer than B instead of hashing it (RFC 2104 §2)', () => {
    const truncating = testHmac({ mac: (key, data, options) => { rejectOptions(options); return hmacTag(key, data, true); } });
    truncating.create = (key, options) => { rejectOptions(options); const copy = key.slice(); return bufferingMacContext((data) => truncating.mac(copy, data)); };
    expect(macFamilyProblems(macFamily([truncating]), 'toy')).toEqual(['Mac hmac-toy-256: a 65-byte key: keys differing only after byte 64 give the same tag (the long key is not hashed)']);
  });

  it('skips the long-key check when keys longer than B are not allowed', () => {
    const bounded = testHmac({ keySizes: { min: 0, max: 64 }, mac: (key, data, options) => { if (key.length > 64) throw new RangeError('long'); rejectOptions(options); return hmacTag(key, data, true); } });
    bounded.create = (key, options) => { bounded.mac(key, new Uint8Array(0), options); const copy = key.slice(); return bufferingMacContext((data) => bounded.mac(copy, data)); };
    expect(macFamilyProblems(macFamily([bounded]), 'toy')).toEqual([]);
  });

  it('is the sanity check implementedPortProblems runs for Mac', () => {
    expect(implementedPortProblems({ id: 'toy', implements: ['Mac'] }, { ports: { Mac: macFamily() } })).toEqual([]);
    expect(implementedPortProblems({ id: 'other', implements: ['Mac'] }, { ports: { Mac: macFamily() } })).toEqual(['Mac: family id "toy" is not the producer id "other"']);
  });
});

describe('portMemberProblems', () => {
  const ports = { Hash: toyFamily(), Mac: macFamily([testHmac(), testKmac()]) };
  const declared: PrimitiveManifest['portMembers'] = {
    Hash: [{ id: 'toy-256', labelKey: 'plugin.toy.hash.256' }, { id: 'toy-224', labelKey: 'plugin.toy.hash.224' }],
    Mac: [{ id: 'hmac-toy-256', labelKey: 'plugin.toy.mac.hmac', construction: 'hmac' }, { id: 'kmac-toy', labelKey: 'plugin.toy.mac.kmac', construction: 'kmac' }],
  };

  it('passes members declared in the loaded order with matching constructions', () => {
    expect(portMemberProblems({ implements: ['Hash', 'Mac'], portMembers: declared }, { ports })).toEqual([]);
    expect(portMemberProblems({ implements: ['Hash'] }, { ports })).toEqual([]);
  });

  it('reports ids that differ from the loaded members or their order', () => {
    const swapped = { Hash: [...declared.Hash!].reverse() };
    expect(portMemberProblems({ implements: ['Hash'], portMembers: swapped }, { ports })).toEqual(['portMembers.Hash: [toy-224, toy-256] is not the loaded members [toy-256, toy-224] in order']);
    expect(portMemberProblems({ implements: ['Mac'], portMembers: { Mac: declared.Mac!.slice(1) } }, { ports })).toEqual(['portMembers.Mac: [kmac-toy] is not the loaded members [hmac-toy-256, kmac-toy] in order']);
  });

  it('reports constructions that differ from the loaded ones (and any on a Hash member)', () => {
    const wrong = { Mac: [{ ...declared.Mac![0]!, construction: 'keyed-hash' as const }, declared.Mac![1]!] };
    expect(portMemberProblems({ implements: ['Mac'], portMembers: wrong }, { ports })).toEqual(['portMembers.Mac: "hmac-toy-256" declares construction "keyed-hash", the loaded member has "hmac"']);
    const hashWithKind = { Hash: [{ ...declared.Hash![0]!, construction: 'hmac' as const }, declared.Hash![1]!] };
    expect(portMemberProblems({ implements: ['Hash'], portMembers: hashWithKind }, { ports })).toEqual(['portMembers.Hash: "toy-256" declares construction "hmac", the loaded member has "undefined"']);
  });

  it('reports members of a port that is not a family port, not implemented or not exposed', () => {
    expect(portMemberProblems({ implements: ['BlockCipher'], portMembers: { BlockCipher: [] } as never }, { ports })).toEqual(['portMembers: "BlockCipher" is not Hash or Mac']);
    expect(portMemberProblems({ implements: ['Hash'], portMembers: { Mac: declared.Mac } }, { ports })).toEqual(['portMembers: "Mac" is not in implements']);
    expect(portMemberProblems({ implements: ['Mac'], portMembers: { Mac: declared.Mac } }, {})).toEqual(['portMembers: port "Mac" is missing from module.ports']);
  });
});

describe('implementedPortProblems', () => {
  it('passes when every declared port is exposed and sane', () => {
    expect(implementedPortProblems({ id: 'toy', implements: ['BlockCipher'] }, { ports: { BlockCipher: toyCipher() } })).toEqual([]);
  });

  it('reports a declared port missing from the module', () => {
    expect(implementedPortProblems({ id: 'toy', implements: ['BlockCipher'] }, {})).toEqual(['port "BlockCipher" is declared in implements but missing from module.ports']);
  });

  it('reports unknown port names', () => {
    expect(implementedPortProblems({ id: 'toy', implements: ['Nope' as never] }, {})).toEqual(['implements: "Nope" is not a port name']);
  });
});

const producer = (id: string, ports: PrimitiveManifest['implements']) => ({ id, implements: ports }) as PrimitiveManifest;

describe('portFieldProblems', () => {
  const cipher: ParamField = { name: 'cipher', labelKey: 'k', kind: 'port', port: 'BlockCipher' };

  it('passes when a registered producer implements the port', () => {
    expect(portFieldProblems([cipher], [producer('aes', ['BlockCipher'])])).toEqual([]);
  });

  it('reports ports nobody implements and invalid port names', () => {
    expect(portFieldProblems([cipher], [producer('xor', [])])).toEqual(['param "cipher": no registered producer implements port "BlockCipher"']);
    expect(portFieldProblems([{ ...cipher, port: 'Nope' as never }], [])).toEqual(['param "cipher": "Nope" is not a port name']);
    expect(portFieldProblems([{ ...cipher, port: undefined }], [])).toEqual(['param "cipher": "undefined" is not a port name']);
  });

  it('ignores other field kinds', () => expect(portFieldProblems([{ name: 'keyHex', labelKey: 'k', kind: 'hex' }], [])).toEqual([]));

  it('accepts member fields on Hash and Mac, constructions only on Mac', () => {
    const producers = [producer('sha256', ['Hash', 'Mac'])];
    const mac: ParamField = { name: 'mac', labelKey: 'k', kind: 'port', port: 'Mac', member: true, constructions: ['hmac'] };
    expect(portFieldProblems([mac, { ...mac, name: 'hash', port: 'Hash', constructions: undefined }], producers)).toEqual([]);
  });

  it('reports member fields on other ports and constructions outside Mac member fields', () => {
    const producers = [producer('aes', ['BlockCipher']), producer('sha256', ['Hash', 'Mac'])];
    expect(portFieldProblems([{ ...cipher, member: true }], producers)).toEqual(['param "cipher": a member field needs port Hash or Mac, not "BlockCipher"']);
    expect(portFieldProblems([{ name: 'hash', labelKey: 'k', kind: 'port', port: 'Hash', member: true, constructions: ['hmac'] }], producers)).toEqual(['param "hash": constructions need a Mac member field']);
    expect(portFieldProblems([{ name: 'mac', labelKey: 'k', kind: 'port', port: 'Mac', constructions: ['hmac'] }], producers)).toEqual(['param "mac": constructions need a Mac member field']);
  });
});

describe('textFieldProblems', () => {
  const message: ParamField = { name: 'message', labelKey: 'k', kind: 'text', maxLength: 4 };

  it('passes text values within maxLength', () => {
    expect(textFieldProblems([message], [{ name: 'defaults', params: { message: 'abcd' } }])).toEqual([]);
  });

  it('reports a bad maxLength and values that do not fit', () => {
    expect(textFieldProblems([{ ...message, maxLength: 0 }], [])).toEqual(['param "message": maxLength 0 is not a positive integer']);
    expect(textFieldProblems([message], [{ name: 'defaults', params: { message: 'abcde' } }, { name: 'preset x', params: { message: 3 } }])).toEqual([
      'defaults: param "message" is not a string of at most 4 UTF-8 bytes',
      'preset x: param "message" is not a string of at most 4 UTF-8 bytes',
    ]);
  });

  it('measures a field in hex-decoded bytes while its declared encodingParam is hex (docs/EXTENDING.md "Text params")', () => {
    const input: ParamField = { ...message, name: 'input', encodingParam: 'encoding' };
    const encoding: ParamField = { name: 'encoding', labelKey: 'k', kind: 'select', options: [{ value: 'utf8', labelKey: 'u' }, { value: 'hex', labelKey: 'h' }] };
    const hex = (text: string) => ({ name: 'hex', params: { input: text, encoding: 'hex' } });
    expect(textFieldProblems([encoding, input], [hex('a3'.repeat(4)), hex('a3 a3:a3-A3'), { name: 'utf8', params: { input: 'abcd', encoding: 'utf8' } }])).toEqual([]);
    expect(textFieldProblems([encoding, input], [hex('a3'.repeat(5)), hex('zz'), hex('a3a'), { name: 'utf8', params: { input: 'a3a3a3', encoding: 'utf8' } }])).toEqual([
      'hex: param "input" is not hex of at most 4 bytes',
      'hex: param "input" is not hex of at most 4 bytes',
      'hex: param "input" is not hex of at most 4 bytes',
      'utf8: param "input" is not a string of at most 4 UTF-8 bytes',
    ]);
  });

  it('measures every other text field in UTF-8 bytes, whatever the encoding (e.g. cSHAKE N and S)', () => {
    const customization: ParamField = { ...message, name: 'customization' };
    expect(textFieldProblems([customization], [{ name: 'S', params: { customization: 'abcd', encoding: 'hex' } }])).toEqual([]);
    expect(textFieldProblems([customization], [{ name: 'S', params: { customization: 'abcdef', encoding: 'hex' } }])).toEqual(['S: param "customization" is not a string of at most 4 UTF-8 bytes']);
  });

  it('requires encodingParam to name a sibling select with a hex option, on text fields only', () => {
    const encoding: ParamField = { name: 'encoding', labelKey: 'k', kind: 'select', options: [{ value: 'utf8', labelKey: 'u' }, { value: 'hex', labelKey: 'h' }] };
    const input: ParamField = { ...message, name: 'input', encodingParam: 'encoding' };
    expect(textFieldProblems([encoding, input], [])).toEqual([]);
    expect(textFieldProblems([input], [])).toEqual(['param "input": encodingParam "encoding" is not a sibling select with a "hex" option']);
    expect(textFieldProblems([{ ...encoding, options: [{ value: 'utf8', labelKey: 'u' }] }, input], [])).toEqual(['param "input": encodingParam "encoding" is not a sibling select with a "hex" option']);
    expect(textFieldProblems([encoding, { name: 'keyHex', labelKey: 'k', kind: 'hex', encodingParam: 'encoding' }], [])).toEqual(['param "keyHex": encodingParam on a hex field (text fields only)']);
  });
});

describe('runInProblems', () => {
  it('accepts no flag, main and worker', () => {
    expect(runInProblems({})).toEqual([]);
    expect(runInProblems({ runIn: 'main' })).toEqual([]);
    expect(runInProblems({ runIn: 'worker' })).toEqual([]);
  });

  it('reports anything else', () => expect(runInProblems({ runIn: 'gpu' as never })).toEqual(['runIn "gpu" is not "main" or "worker"']));
});
