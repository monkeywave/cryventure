import {
  bytesEqual,
  isMemberPortName,
  isPortName,
  parsePortMemberRef,
  portMemberRef,
  type BlockCipher,
  type HashContext,
  type HashFamily,
  type HashFunction,
  type MacContext,
  type MacFamily,
  type MacFunction,
  type MacOptions,
  type MemberPortName,
  type ParamField,
  type PortMap,
  type PortMemberDecl,
  type PortName,
  type PrimitiveManifest,
  type PrimitiveModule,
  type XofContext,
  type XofCustomization,
  type XofFunction,
} from '@cryventure/core';
import { textFieldByteLength } from '@cryventure/primitives';

/**
 * Contract checks for ports, port and text params and the `runIn` flag (docs/M3.md §1, §2, §8).
 * Each returns a list of human-readable problems (empty = pass).
 */

const isPositiveInteger = (value: unknown): boolean => typeof value === 'number' && Number.isInteger(value) && value > 0;

/** Deterministic, non-trivial test bytes. */
const testBytes = (length: number, seed: number): Uint8Array => Uint8Array.from({ length }, (_, i) => (i * 31 + seed) & 0xff);

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function throws(action: () => unknown): boolean {
  try {
    action();
    return false;
  } catch {
    return true;
  }
}

function roundTripProblems(cipher: BlockCipher, keySize: number): string[] {
  const block = testBytes(cipher.blockSize, 3);
  try {
    const key = testBytes(keySize, 7);
    const decrypted = cipher.decryptBlock(key, cipher.encryptBlock(key, block));
    return bytesEqual(decrypted, block) ? [] : [`BlockCipher: decrypt(encrypt(block)) differs from block for a ${keySize}-byte key`];
  } catch (error) {
    return [`BlockCipher: round trip with a ${keySize}-byte key threw: ${errorMessage(error)}`];
  }
}

/** Both directions must throw for this key/block pair. */
function wrongLengthProblems(cipher: BlockCipher, key: Uint8Array, block: Uint8Array, what: string): string[] {
  const directions = [
    ['encryptBlock', () => cipher.encryptBlock(key, block)],
    ['decryptBlock', () => cipher.decryptBlock(key, block)],
  ] as const;
  return directions.filter(([, action]) => !throws(action)).map(([name]) => `BlockCipher: ${name} accepts a ${what}`);
}

function smallestInvalidKeySize(keySizes: readonly number[]): number {
  let size = 1;
  while (keySizes.includes(size)) size++;
  return size;
}

/** Sizes, a decrypt∘encrypt round trip per key size, and that wrong key and block lengths throw. */
export function blockCipherProblems(cipher: BlockCipher, producerId: string): string[] {
  const idProblems = cipher.id === producerId ? [] : [`BlockCipher: id "${cipher.id}" is not the producer id "${producerId}"`];
  if (!isPositiveInteger(cipher.blockSize)) return [...idProblems, `BlockCipher: blockSize ${cipher.blockSize} is not a positive integer`];
  if (cipher.keySizes.length === 0) return [...idProblems, 'BlockCipher: keySizes is empty'];
  const badSizes = cipher.keySizes.filter((size) => !isPositiveInteger(size));
  if (badSizes.length > 0) return [...idProblems, `BlockCipher: keySizes [${badSizes.join()}] are not positive integers`];
  const wrongKey = smallestInvalidKeySize(cipher.keySizes);
  const validKey = testBytes(cipher.keySizes[0]!, 7);
  return [
    ...idProblems,
    ...cipher.keySizes.flatMap((size) => roundTripProblems(cipher, size)),
    ...wrongLengthProblems(cipher, testBytes(wrongKey, 7), testBytes(cipher.blockSize, 3), `${wrongKey}-byte key`),
    ...wrongLengthProblems(cipher, validKey, testBytes(cipher.blockSize + 1, 3), `${cipher.blockSize + 1}-byte block`),
  ];
}

const HASH_INPUT_SEED = 5;

/** Digests of the same input twice (the given buffer, then a copy taken before hashing), or the reason hashing threw. */
function digestPair(fn: HashFunction, data: Uint8Array): [Uint8Array, Uint8Array] | string {
  const pristine = data.slice();
  try {
    return [fn.hash(data), fn.hash(pristine)];
  } catch (error) {
    return errorMessage(error);
  }
}

interface DigestCheck {
  problems: string[];
  /** The digest, when it is well-formed and deterministic. */
  digest?: Uint8Array;
}

/** Deterministic, `outputSize` bytes and leaves its input unchanged, for one input length. */
function digestCheck(fn: HashFunction, length: number): DigestCheck {
  const where = `Hash ${fn.id}: ${length}-byte input`;
  const input = testBytes(length, HASH_INPUT_SEED);
  const digests = digestPair(fn, input);
  if (typeof digests === 'string') return { problems: [`${where} threw: ${digests}`] };
  const [first, second] = digests;
  const mutated = bytesEqual(input, testBytes(length, HASH_INPUT_SEED)) ? [] : [`${where}: hash mutates its input`];
  if (!(first instanceof Uint8Array) || first.length !== fn.outputSize) return { problems: [`${where}: digest is not ${fn.outputSize} bytes`, ...mutated] };
  if (!(second instanceof Uint8Array) || !bytesEqual(first, second)) return { problems: [`${where}: hash is not deterministic`, ...mutated] };
  return { problems: mutated, digest: first };
}

/** Pairs of input lengths whose digests are equal (a constant or length-blind function). */
function collisionProblems(fn: HashFunction, lengths: readonly number[], digests: readonly Uint8Array[]): string[] {
  return lengths.flatMap((length, i) =>
    lengths.slice(i + 1).flatMap((other, offset) => (bytesEqual(digests[i]!, digests[i + 1 + offset]!) ? [`Hash ${fn.id}: ${length}-byte and ${other}-byte inputs have the same digest`] : [])),
  );
}

/**
 * Sizes, then per 0-, 1- and block-sized input: deterministic, `outputSize` bytes, input unchanged;
 * once all three digests are well-formed, they must be pairwise distinct; once all of that holds,
 * the incremental context must agree with `hash()` (docs/M6.md §1).
 */
function hashFunctionProblems(fn: HashFunction): string[] {
  if (!isPositiveInteger(fn.blockSize)) return [`Hash ${fn.id}: blockSize ${fn.blockSize} is not a positive integer`];
  if (!isPositiveInteger(fn.outputSize)) return [`Hash ${fn.id}: outputSize ${fn.outputSize} is not a positive integer`];
  const lengths = [0, 1, fn.blockSize];
  const checks = lengths.map((length) => digestCheck(fn, length));
  const problems = checks.flatMap((check) => check.problems);
  const digests = checks.map((check) => check.digest).filter((digest) => digest !== undefined);
  if (digests.length !== lengths.length) return problems;
  problems.push(...collisionProblems(fn, lengths, digests));
  return problems.length > 0 ? problems : hashContextProblems(fn);
}

/** `data` cut at `offsets` (ascending, within `data`). */
const splitAt = (data: Uint8Array, offsets: readonly number[]): Uint8Array[] =>
  [0, ...offsets].map((start, index) => data.subarray(start, offsets[index] ?? data.length));

/** Every byte on its own. */
const byteByByte = (data: Uint8Array): Uint8Array[] => Array.from(data, (byte) => Uint8Array.of(byte));

/** The ways `create()` + `update` is fed (0 | n, 1 | n−1, block-aligned, byte by byte for a short input). */
function hashSplits(blockSize: number): { name: string; length: number; parts: (data: Uint8Array) => Uint8Array[] }[] {
  const length = 2 * blockSize + 3;
  return [
    { name: '0 | n', length, parts: (data) => splitAt(data, [0]) },
    { name: '1 | n−1', length, parts: (data) => splitAt(data, [1]) },
    { name: 'block-aligned', length, parts: (data) => splitAt(data, [blockSize, 2 * blockSize]) },
    { name: 'byte by byte', length: blockSize + 1, parts: byteByByte },
  ];
}

function absorbAll<C extends { update(data: Uint8Array): void }>(context: C, parts: readonly Uint8Array[]): C {
  for (const part of parts) context.update(part);
  return context;
}

/** Problems of one context check, or the reason it threw. */
function guarded(where: string, check: () => string[]): string[] {
  try {
    return check();
  } catch (error) {
    return [`${where} threw: ${errorMessage(error)}`];
  }
}

/** A context type checked against its one-shot function (`HashContext`, `MacContext`). */
interface Incremental<C extends { update(data: Uint8Array): void; clone(): C }> {
  /** Problem prefix, e.g. `Hash sha-256` or `Mac hmac-sha-256 (32-byte key)`. */
  name: string;
  /** How the context is made and finalised, and the one-shot function, as named in problems. */
  labels: { create: string; final: string; oneShot: string };
  blockSize: number;
  create(): C;
  final(context: C): Uint8Array;
  oneShot(data: Uint8Array): Uint8Array;
}

function splitProblems<C extends { update(data: Uint8Array): void; clone(): C }>(subject: Incremental<C>): string[] {
  return hashSplits(subject.blockSize).flatMap(({ name, length, parts }) => {
    const data = testBytes(length, HASH_INPUT_SEED);
    const where = `${subject.name}: ${subject.labels.create} + update (${name}, ${length} bytes)`;
    return guarded(where, () => (bytesEqual(subject.final(absorbAll(subject.create(), parts(data))), subject.oneShot(data)) ? [] : [`${where} differs from ${subject.labels.oneShot}`]));
  });
}

/** Finalising twice gives the same bytes and does not stop `update`. */
function finalTwiceProblems<C extends { update(data: Uint8Array): void; clone(): C }>(subject: Incremental<C>): string[] {
  const where = `${subject.name}: ${subject.labels.final}`;
  return guarded(where, () => {
    const data = testBytes(subject.blockSize + 1, HASH_INPUT_SEED);
    const context = absorbAll(subject.create(), [data.subarray(0, 1)]);
    const first = subject.final(context);
    const problems = bytesEqual(first, subject.final(context)) ? [] : [`${where} twice gives different bytes`];
    context.update(data.subarray(1));
    return bytesEqual(subject.final(context), subject.oneShot(data)) ? problems : [...problems, `${where} stops a later update from counting`];
  });
}

/** A clone taken after `prefix` is independent of its source in both directions. */
function cloneProblems<C extends { update(data: Uint8Array): void; clone(): C }>(subject: Incremental<C>): string[] {
  const where = `${subject.name}: clone()`;
  return guarded(where, () => {
    const prefix = testBytes(subject.blockSize + 1, HASH_INPUT_SEED);
    const source = absorbAll(subject.create(), [prefix]);
    const clone = source.clone();
    source.update(Uint8Array.of(1));
    const cloneUnchanged = bytesEqual(subject.final(clone), subject.oneShot(prefix));
    clone.update(Uint8Array.of(2));
    const sourceUnchanged = bytesEqual(subject.final(source), subject.oneShot(Uint8Array.of(...prefix, 1)));
    return cloneUnchanged && sourceUnchanged ? [] : [`${where} is not independent of its source`];
  });
}

function incrementalProblems<C extends { update(data: Uint8Array): void; clone(): C }>(subject: Incremental<C>): string[] {
  return [...splitProblems(subject), ...finalTwiceProblems(subject), ...cloneProblems(subject)];
}

function hashContextProblems(fn: HashFunction): string[] {
  if (typeof fn.create !== 'function') return [`Hash ${fn.id}: create is not a function`];
  return incrementalProblems<HashContext>({
    name: `Hash ${fn.id}`,
    labels: { create: 'create()', final: 'digest()', oneShot: 'hash()' },
    blockSize: fn.blockSize,
    create: () => fn.create(),
    final: (context) => context.digest(),
    oneShot: (data) => fn.hash(data),
  });
}

/** The output of a fresh context over `data`, squeezed in `lengths` pieces and joined. */
function squeezed(context: XofContext, data: Uint8Array, lengths: readonly number[]): Uint8Array {
  context.update(data);
  return Uint8Array.from(lengths.flatMap((length) => [...context.squeeze(length)]));
}

/** `xof(m, a + b)` = `squeeze(a) ‖ squeeze(b)`, across a rate boundary, and the output length. */
function xofSqueezeProblems(xof: XofFunction): string[] {
  const where = `Hash ${xof.id}: squeeze`;
  return guarded(where, () => {
    const data = testBytes(xof.blockSize + 1, HASH_INPUT_SEED);
    const [a, b] = [xof.blockSize - 1, xof.blockSize + 2];
    const whole = xof.xof(data, a + b);
    if (whole.length !== a + b) return [`Hash ${xof.id}: xof(m, ${a + b}) is not ${a + b} bytes`];
    return bytesEqual(squeezed(xof.create(), data, [a, b]), whole) ? [] : [`${where}(${a}) ‖ squeeze(${b}) differs from xof(m, ${a + b})`];
  });
}

/** A clone is independent of its source, and `update` after `squeeze` throws. */
function xofContextProblems(xof: XofFunction): string[] {
  const where = `Hash ${xof.id}: context`;
  return guarded(where, () => {
    const data = testBytes(3, HASH_INPUT_SEED);
    const expected = xof.xof(data, 32);
    const source = xof.create();
    source.update(data);
    const clone = source.clone();
    source.update(Uint8Array.of(1));
    const problems = bytesEqual(clone.squeeze(32), expected) ? [] : [`${where}: clone() is not independent of its source`];
    return throws(() => clone.update(data)) ? problems : [...problems, `${where}: update after squeeze does not throw`];
  });
}

const NON_EMPTY: readonly XofCustomization[] = [{ functionName: Uint8Array.of(0x4e) }, { customization: Uint8Array.of(0x53) }];
const EMPTY: XofCustomization = { functionName: new Uint8Array(0), customization: new Uint8Array(0) };

/** A non-customizable XOF throws on a non-empty N or S (in `xof` and `create`) and accepts empty ones. */
function xofCustomizationProblems(xof: XofFunction): string[] {
  if (typeof xof.customizable !== 'boolean') return [`Hash ${xof.id}: customizable is not a boolean`];
  if (xof.customizable) return [];
  const data = testBytes(3, HASH_INPUT_SEED);
  const accepted = NON_EMPTY.filter((custom) => !throws(() => xof.xof(data, 16, custom)) || !throws(() => xof.create(custom)));
  const where = `Hash ${xof.id}: empty N and S`;
  const empty = guarded(where, () => (bytesEqual(xof.xof(data, 16, EMPTY), xof.xof(data, 16)) ? [] : [`${where} change the output`]));
  return [...(accepted.length > 0 ? [`Hash ${xof.id}: is not customizable but accepts a non-empty N or S`] : []), ...empty];
}

const MID_SQUEEZE = { before: 5, after: 7 } as const;

/** A context over `data` that has already squeezed `MID_SQUEEZE.before` bytes. */
function midSqueeze(xof: XofFunction, data: Uint8Array): XofContext {
  const context = xof.create();
  context.update(data);
  context.squeeze(MID_SQUEEZE.before);
  return context;
}

/**
 * A clone taken mid-squeeze continues the stream exactly where its source stood, and squeezing
 * either one (first) leaves the other unaffected.
 */
function xofMidSqueezeCloneProblems(xof: XofFunction): string[] {
  const where = `Hash ${xof.id}: context`;
  return guarded(`${where}: mid-squeeze clone()`, () => {
    const data = testBytes(3, HASH_INPUT_SEED);
    const { before, after } = MID_SQUEEZE;
    const expected = xof.xof(data, before + after).subarray(before);
    const continues = (first: XofContext, second: XofContext): boolean => bytesEqual(first.squeeze(after), expected) && bytesEqual(second.squeeze(after), expected);
    const sourceFirst = midSqueeze(xof, data);
    const cloneSurvives = continues(sourceFirst, sourceFirst.clone());
    const cloneFirst = midSqueeze(xof, data);
    const sourceSurvives = continues(cloneFirst.clone(), cloneFirst);
    return [
      ...(cloneSurvives ? [] : [`${where}: a clone taken mid-squeeze changes when its source squeezes on`]),
      ...(sourceSurvives ? [] : [`${where}: a source changes when its mid-squeeze clone squeezes on`]),
    ];
  });
}

const CUSTOMIZATION_LABEL = (custom: XofCustomization): string => (custom.functionName !== undefined ? 'N' : 'S');

/** On a customizable XOF, `create(custom)` + `update` equals `xof(data, n, custom)` for a non-empty N or S. */
function xofCustomContextProblems(xof: XofFunction): string[] {
  if (xof.customizable !== true) return [];
  const data = testBytes(3, HASH_INPUT_SEED);
  return NON_EMPTY.flatMap((custom) => {
    const label = CUSTOMIZATION_LABEL(custom);
    const where = `Hash ${xof.id}: create(${label}) + update`;
    return guarded(where, () => (bytesEqual(squeezed(xof.create(custom), data, [32]), xof.xof(data, 32, custom)) ? [] : [`${where} differs from xof(m, 32, ${label})`]));
  });
}

function xofFunctionProblems(xof: XofFunction): string[] {
  if (!isPositiveInteger(xof.blockSize)) return [`Hash ${xof.id}: blockSize ${xof.blockSize} is not a positive integer`];
  if (!isPositiveInteger(xof.securityBits)) return [`Hash ${xof.id}: securityBits ${xof.securityBits} is not a positive integer`];
  return [...xofSqueezeProblems(xof), ...xofContextProblems(xof), ...xofMidSqueezeCloneProblems(xof), ...xofCustomizationProblems(xof), ...xofCustomContextProblems(xof)];
}

/** cSHAKE with N and S both empty equals the SHAKE of the same strength in the family (SP 800-185 §3.3). */
function cshakeAsShakeProblems(xofs: readonly XofFunction[]): string[] {
  const data = testBytes(5, HASH_INPUT_SEED);
  return xofs
    .filter((xof) => xof.customizable)
    .flatMap((cshake) => {
      const shake = xofs.find((xof) => !xof.customizable && xof.securityBits === cshake.securityBits);
      if (shake === undefined) return [];
      const where = `Hash ${cshake.id}: with empty N and S`;
      return guarded(where, () => {
        const plain = shake.xof(data, 32);
        const same = [cshake.xof(data, 32), cshake.xof(data, 32, EMPTY), squeezed(cshake.create(EMPTY), data, [32])].every((output) => bytesEqual(output, plain));
        return same ? [] : [`${where} differs from ${shake.id}`];
      });
    });
}

function duplicateIds(entries: readonly { readonly id: string }[]): string[] {
  const ids = entries.map((entry) => entry.id);
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}

/**
 * Family id = producer id, at least one function, unique ids across functions and XOFs, every
 * function and XOF sane, and cSHAKE with empty N and S equal to SHAKE (docs/M5.md §1, docs/M6.md §1).
 */
export function hashFamilyProblems(family: HashFamily, producerId: string): string[] {
  const problems = family.id === producerId ? [] : [`Hash: family id "${family.id}" is not the producer id "${producerId}"`];
  if (family.functions.length === 0) return [...problems, 'Hash: functions is empty'];
  const xofs = family.xofs ?? [];
  problems.push(...duplicateIds([...family.functions, ...xofs]).map((id) => `Hash: function id "${id}" is not unique`));
  return [...problems, ...family.functions.flatMap(hashFunctionProblems), ...xofs.flatMap(xofFunctionProblems), ...cshakeAsShakeProblems(xofs)];
}

const MAC_KEY_SEED = 11;
const MAC_CONSTRUCTIONS: readonly unknown[] = ['hmac', 'kmac', 'keyed-hash'];
const isNonNegativeInteger = (value: unknown): boolean => typeof value === 'number' && Number.isInteger(value) && value >= 0;

const keyAllowed = (fn: MacFunction, length: number): boolean => length >= fn.keySizes.min && (fn.keySizes.max === undefined || length <= fn.keySizes.max);

/** The key lengths a MAC is exercised with: min, 1, blockSize and blockSize + 1, each when allowed. */
const macKeyLengths = (fn: MacFunction): number[] => [...new Set([fn.keySizes.min, 1, fn.blockSize, fn.blockSize + 1])].filter((length) => keyAllowed(fn, length));

function macConstructionProblems(fn: MacFunction): string[] {
  const { construction } = fn;
  if (!MAC_CONSTRUCTIONS.includes(construction?.kind)) return [`Mac ${fn.id}: construction kind "${String(construction?.kind)}" is not hmac, kmac or keyed-hash`];
  if (construction.kind === 'hmac' && parsePortMemberRef(construction.hash) === undefined) return [`Mac ${fn.id}: hmac construction hash "${construction.hash}" is not a member ref`];
  return [];
}

/** Sizes, key sizes, the option flags and the construction. */
function macShapeProblems(fn: MacFunction): string[] {
  const { min, max } = fn.keySizes;
  return [
    ...(isPositiveInteger(fn.outputSize) ? [] : [`Mac ${fn.id}: outputSize ${fn.outputSize} is not a positive integer`]),
    ...(isPositiveInteger(fn.blockSize) ? [] : [`Mac ${fn.id}: blockSize ${fn.blockSize} is not a positive integer`]),
    ...(isNonNegativeInteger(min) ? [] : [`Mac ${fn.id}: keySizes.min ${min} is not a non-negative integer`]),
    ...(max === undefined || (isNonNegativeInteger(max) && max >= min) ? [] : [`Mac ${fn.id}: keySizes.max ${max} is not an integer ≥ min`]),
    ...(typeof fn.customizable === 'boolean' && typeof fn.variableOutput === 'boolean' ? [] : [`Mac ${fn.id}: customizable or variableOutput is not a boolean`]),
    ...macConstructionProblems(fn),
  ];
}

/** Deterministic, `outputSize` bytes, key and message unchanged, for one key and message length. */
function tagProblems(fn: MacFunction, keyLength: number, length: number): string[] {
  const where = `Mac ${fn.id}: ${keyLength}-byte key, ${length}-byte message`;
  return guarded(where, () => {
    const [key, data] = [testBytes(keyLength, MAC_KEY_SEED), testBytes(length, HASH_INPUT_SEED)];
    const [keyCopy, dataCopy] = [key.slice(), data.slice()];
    const [first, second] = [fn.mac(key, data), fn.mac(keyCopy, dataCopy)];
    const pristine = bytesEqual(key, testBytes(keyLength, MAC_KEY_SEED)) && bytesEqual(data, testBytes(length, HASH_INPUT_SEED));
    const mutated = pristine ? [] : [`${where}: mac mutates its key or message`];
    if (!(first instanceof Uint8Array) || first.length !== fn.outputSize) return [`${where}: tag is not ${fn.outputSize} bytes`, ...mutated];
    return bytesEqual(first, second) ? mutated : [`${where}: mac is not deterministic`, ...mutated];
  });
}

function macContextProblems(fn: MacFunction, keyLength: number): string[] {
  const key = testBytes(keyLength, MAC_KEY_SEED);
  return incrementalProblems<MacContext>({
    name: `Mac ${fn.id} (${keyLength}-byte key)`,
    labels: { create: 'create(key)', final: 'mac()', oneShot: 'mac(key, m)' },
    blockSize: fn.blockSize,
    create: () => fn.create(key),
    final: (context) => context.mac(),
    oneShot: (data) => fn.mac(key, data),
  });
}

function throwsRangeError(action: () => unknown): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof RangeError;
  }
}

/** `mac` and `create` throw a `RangeError` for a key just below `min` and just above `max`. */
function macKeyRangeProblems(fn: MacFunction): string[] {
  const { min, max } = fn.keySizes;
  const outside = [min - 1, ...(max === undefined ? [] : [max + 1])].filter((length) => length >= 0);
  const data = testBytes(3, HASH_INPUT_SEED);
  return outside.flatMap((length) => {
    const key = testBytes(length, MAC_KEY_SEED);
    const calls = [['mac', () => fn.mac(key, data)], ['create', () => fn.create(key)]] as const;
    return calls.filter(([, call]) => !throwsRangeError(call)).map(([name]) => `Mac ${fn.id}: ${name} does not throw a RangeError for a ${length}-byte key`);
  });
}

/** Options a function does not accept throw (in `mac` and `create`). */
function unsupportedOptionProblems(fn: MacFunction): string[] {
  const [key, data] = [testBytes(fn.keySizes.min, MAC_KEY_SEED), testBytes(3, HASH_INPUT_SEED)];
  const unsupported: [string, MacOptions][] = [
    ...(fn.customizable ? [] : [['a customization', { customization: Uint8Array.of(0x53) }] as [string, MacOptions]]),
    ...(fn.variableOutput ? [] : [['an outputLength', { outputLength: fn.outputSize + 1 }] as [string, MacOptions]]),
  ];
  const accepted = unsupported.filter(([, options]) => !throws(() => fn.mac(key, data, options)) || !throws(() => fn.create(key, options)));
  return accepted.map(([what]) => `Mac ${fn.id}: accepts ${what} it does not support`);
}

/** A variable output length is honoured (`mac` and `create`), and L + 1 bytes are not the L-byte tag zero-padded. */
function outputLengthProblems(fn: MacFunction): string[] {
  if (!fn.variableOutput) return [];
  const [key, data] = [testBytes(fn.keySizes.min, MAC_KEY_SEED), testBytes(3, HASH_INPUT_SEED)];
  const outputLength = fn.outputSize + 1;
  const where = `Mac ${fn.id}: outputLength ${outputLength}`;
  return guarded(where, () => {
    const [longer, context] = [fn.mac(key, data, { outputLength }), fn.create(key, { outputLength }).mac()];
    if (![longer, context].every((tag) => tag.length === outputLength)) return [`${where} is not honoured`];
    const padded = longer[fn.outputSize] === 0 && bytesEqual(longer.subarray(0, fn.outputSize), fn.mac(key, data, { outputLength: fn.outputSize }));
    return padded ? [`${where} is the ${fn.outputSize}-byte tag zero-padded`] : [];
  });
}

/** A customizable function accepts a customization S, and two different S give different tags. */
function customizationProblems(fn: MacFunction): string[] {
  if (!fn.customizable) return [];
  const [key, data] = [testBytes(fn.keySizes.min, MAC_KEY_SEED), testBytes(3, HASH_INPUT_SEED)];
  const where = `Mac ${fn.id}: customization`;
  return guarded(where, () => {
    const [s, t] = [Uint8Array.of(0x53), Uint8Array.of(0x54)].map((customization) => fn.mac(key, data, { customization }));
    return bytesEqual(s!, t!) ? [`${where}: different S give the same tag`] : [];
  });
}

/** Whether two `length`-byte keys differing only in byte `index` give the same tag (the key, or that byte, is ignored). */
function sameTagForFlippedKey(fn: MacFunction, length: number, index: number): boolean {
  const key = testBytes(length, MAC_KEY_SEED);
  const other = Uint8Array.from(key, (byte, i) => (i === index ? byte ^ 1 : byte));
  const data = testBytes(3, HASH_INPUT_SEED);
  return bytesEqual(fn.mac(key, data), fn.mac(other, data));
}

/** The key matters: for every exercised key length 1..B, two keys differing only in byte 0 give different tags. */
function keySensitivityProblems(fn: MacFunction): string[] {
  return macKeyLengths(fn)
    .filter((length) => length >= 1 && length <= fn.blockSize)
    .flatMap((length) => {
      const where = `Mac ${fn.id}: two ${length}-byte keys`;
      return guarded(where, () => (sameTagForFlippedKey(fn, length, 0) ? [`${where} differing only in byte 0 give the same tag (the key is ignored)`] : []));
    });
}

/** HMAC hashes a key longer than B (RFC 2104 §2): two such keys differing only in byte B give different tags. */
function hmacLongKeyProblems(fn: MacFunction): string[] {
  if (fn.construction.kind !== 'hmac' || !keyAllowed(fn, fn.blockSize + 1)) return [];
  const where = `Mac ${fn.id}: a ${fn.blockSize + 1}-byte key`;
  return guarded(where, () => (sameTagForFlippedKey(fn, fn.blockSize + 1, fn.blockSize) ? [`${where}: keys differing only after byte ${fn.blockSize} give the same tag (the long key is not hashed)`] : []));
}

/**
 * Shape first; then per allowed key length {min, 1, B, B + 1} and message length {0, 1, B, 2B + 3}
 * well-formed tags; once those hold, the incremental context per key length, out-of-range keys,
 * key sensitivity, unsupported options, a real variable output length, a customization that
 * matters and HMAC's long-key branch (docs/M7.md §1a).
 */
function macFunctionProblems(fn: MacFunction): string[] {
  const shape = macShapeProblems(fn);
  if (shape.length > 0) return shape;
  const keyLengths = macKeyLengths(fn);
  const messageLengths = [...new Set([0, 1, fn.blockSize, 2 * fn.blockSize + 3])];
  const tags = keyLengths.flatMap((keyLength) => messageLengths.flatMap((length) => tagProblems(fn, keyLength, length)));
  if (tags.length > 0) return tags;
  if (typeof fn.create !== 'function') return [`Mac ${fn.id}: create is not a function`];
  return [
    ...keyLengths.flatMap((keyLength) => macContextProblems(fn, keyLength)),
    ...macKeyRangeProblems(fn),
    ...keySensitivityProblems(fn),
    ...unsupportedOptionProblems(fn),
    ...outputLengthProblems(fn),
    ...customizationProblems(fn),
    ...hmacLongKeyProblems(fn),
  ];
}

/** Family id = producer id, at least one function, unique ids, every function sane (docs/M7.md §1a). */
export function macFamilyProblems(family: MacFamily, producerId: string): string[] {
  const problems = family.id === producerId ? [] : [`Mac: family id "${family.id}" is not the producer id "${producerId}"`];
  if (family.functions.length === 0) return [...problems, 'Mac: functions is empty'];
  problems.push(...duplicateIds(family.functions).map((id) => `Mac: function id "${id}" is not unique`));
  return [...problems, ...family.functions.flatMap(macFunctionProblems)];
}

/** The sanity check per port; the `Record` makes a new port without a check a type error. */
const PORT_SANITY: { [N in PortName]: (implementation: PortMap[N], producerId: string) => string[] } = {
  BlockCipher: blockCipherProblems,
  Hash: hashFamilyProblems,
  Mac: macFamilyProblems,
};

function portSanity<N extends PortName>(port: N, implementation: PortMap[N], producerId: string): string[] {
  return PORT_SANITY[port](implementation, producerId);
}

/** Every port in `implements` is a port name, is exposed on the loaded module and passes its sanity check. */
export function implementedPortProblems(manifest: Pick<PrimitiveManifest, 'id' | 'implements'>, module: Pick<PrimitiveModule<unknown>, 'ports'>): string[] {
  return manifest.implements.flatMap((port) => {
    if (!isPortName(port)) return [`implements: "${String(port)}" is not a port name`];
    const implementation = module.ports?.[port];
    if (implementation === undefined) return [`port "${port}" is declared in implements but missing from module.ports`];
    return portSanity(port, implementation, manifest.id);
  });
}

/** A member field's port is `Hash` or `Mac`, and only `Mac` member fields filter by `constructions` (docs/M7.md §1b). */
function memberFieldProblems(field: ParamField): string[] {
  const memberPort = field.member === true && isMemberPortName(field.port);
  return [
    ...(field.member === true && !memberPort ? [`param "${field.name}": a member field needs port Hash or Mac, not "${String(field.port)}"`] : []),
    ...(field.constructions !== undefined && !(memberPort && field.port === 'Mac') ? [`param "${field.name}": constructions need a Mac member field`] : []),
  ];
}

/** `port` fields name a real port that at least one registered producer implements; member fields name a family port. */
export function portFieldProblems(fields: readonly ParamField[], producers: readonly Pick<PrimitiveManifest, 'implements'>[]): string[] {
  return fields
    .filter((field) => field.kind === 'port')
    .flatMap((field) => {
      const { port } = field;
      if (!isPortName(port)) return [`param "${field.name}": "${String(port)}" is not a port name`];
      const implemented = producers.some((producer) => producer.implements.includes(port));
      return [...(implemented ? [] : [`param "${field.name}": no registered producer implements port "${port}"`]), ...memberFieldProblems(field)];
    });
}

type LoadedMember = Pick<PortMemberDecl, 'id' | 'construction'>;

/** The members of a loaded family port, in order; the mapped type makes a new member port without an entry a type error. */
const LOADED_MEMBERS: { [N in MemberPortName]: (implementation: PortMap[N]) => LoadedMember[] } = {
  Hash: (family) => family.functions.map((fn) => ({ id: fn.id })),
  Mac: (family) => family.functions.map((fn) => ({ id: fn.id, construction: fn.construction.kind })),
};

function loadedMembers<N extends MemberPortName>(port: N, implementation: PortMap[N]): LoadedMember[] {
  return LOADED_MEMBERS[port](implementation);
}

/** Declared ids equal the loaded ids in order, and each declared construction equals the loaded one (none for Hash). */
function memberListProblems(port: MemberPortName, declared: readonly PortMemberDecl[], loaded: readonly LoadedMember[]): string[] {
  const ids = (members: readonly LoadedMember[]): string => members.map((member) => member.id).join(', ');
  if (ids(declared) !== ids(loaded)) return [`portMembers.${port}: [${ids(declared)}] is not the loaded members [${ids(loaded)}] in order`];
  return declared.flatMap((member, index) => {
    const construction = loaded[index]?.construction;
    return member.construction === construction ? [] : [`portMembers.${port}: "${member.id}" declares construction "${String(member.construction)}", the loaded member has "${String(construction)}"`];
  });
}

/** Every declared member id forms a member ref `parsePortMemberRef` accepts (no `:`, not empty; docs/M7.md §1b). */
function memberIdProblems(port: MemberPortName, producerId: string, declared: readonly PortMemberDecl[]): string[] {
  return declared.flatMap(({ id }) => {
    const ref = portMemberRef(producerId, id);
    return parsePortMemberRef(ref) === undefined ? [`portMembers.${port}: member id "${id}" gives the ref "${ref}", which parsePortMemberRef rejects`] : [];
  });
}

/** Hash and Mac ports in `implements` without a `portMembers` entry: their members would appear in no picker (docs/M7.md §1c). */
function undeclaredMemberPortProblems(manifest: Pick<PrimitiveManifest, 'implements' | 'portMembers'>): string[] {
  return manifest.implements
    .filter((port) => isMemberPortName(port) && manifest.portMembers?.[port] === undefined)
    .map((port) => `portMembers: "${port}" is implemented but declares no members (they appear in no member picker)`);
}

/**
 * Every Hash/Mac port in `implements` declares its members; every declared `portMembers` port is a
 * family port in `implements` whose loaded members match the declaration, with parsable ids (docs/M7.md §1b).
 */
export function portMemberProblems(manifest: Pick<PrimitiveManifest, 'id' | 'implements' | 'portMembers'>, module: Pick<PrimitiveModule<unknown>, 'ports'>): string[] {
  const declaredProblems = Object.entries(manifest.portMembers ?? {}).flatMap(([port, declared]) => {
    if (!isMemberPortName(port)) return [`portMembers: "${port}" is not Hash or Mac`];
    if (!manifest.implements.includes(port)) return [`portMembers: "${port}" is not in implements`];
    const implementation = module.ports?.[port];
    if (implementation === undefined) return [`portMembers: port "${port}" is missing from module.ports`];
    const members = declared ?? [];
    return [...memberListProblems(port, members, loadedMembers(port, implementation)), ...memberIdProblems(port, manifest.id, members)];
  });
  return [...undeclaredMemberPortProblems(manifest), ...declaredProblems];
}

interface ParamCase {
  name: string;
  params: unknown;
}

/** Why one case's value does not fit `maxLength` (docs/EXTENDING.md "Text params"), or undefined when it fits. */
function textFitProblem(field: ParamField, params: Record<string, unknown> | null, maxLength: number): string | undefined {
  const { unit, bytes, valid } = textFieldByteLength(field, params ?? {});
  if (valid && bytes !== undefined && bytes <= maxLength) return undefined;
  return unit === 'hex' ? `is not hex of at most ${maxLength} bytes` : `is not a string of at most ${maxLength} UTF-8 bytes`;
}

/** A declared `encodingParam` sits on a `text` field and names a sibling `select` offering `'hex'`. */
function encodingParamProblems(field: ParamField, fields: readonly ParamField[]): string[] {
  const { encodingParam } = field;
  if (encodingParam === undefined) return [];
  if (field.kind !== 'text') return [`param "${field.name}": encodingParam on a ${field.kind} field (text fields only)`];
  const sibling = fields.find((candidate) => candidate.name === encodingParam);
  const offersHex = sibling?.kind === 'select' && (sibling.options ?? []).some((option) => option.value === 'hex');
  return offersHex ? [] : [`param "${field.name}": encodingParam "${encodingParam}" is not a sibling select with a "hex" option`];
}

/** `text` fields have a positive integer `maxLength`, every case's value fits it, and a declared `encodingParam` is sound. */
export function textFieldProblems(fields: readonly ParamField[], cases: readonly ParamCase[]): string[] {
  return [...fields.flatMap((field) => encodingParamProblems(field, fields)), ...textFitProblems(fields, cases)];
}

function textFitProblems(fields: readonly ParamField[], cases: readonly ParamCase[]): string[] {
  return fields
    .filter((field) => field.kind === 'text')
    .flatMap((field) => {
      const { maxLength } = field;
      if (maxLength === undefined || !isPositiveInteger(maxLength)) return [`param "${field.name}": maxLength ${maxLength} is not a positive integer`];
      return cases.flatMap(({ name, params }) => {
        const problem = textFitProblem(field, params as Record<string, unknown> | null, maxLength);
        return problem === undefined ? [] : [`${name}: param "${field.name}" ${problem}`];
      });
    });
}

const RUN_IN: readonly unknown[] = [undefined, 'main', 'worker'];

/** `runIn` is absent, `'main'` or `'worker'`. */
export function runInProblems(manifest: Pick<PrimitiveManifest, 'runIn'>): string[] {
  return RUN_IN.includes(manifest.runIn) ? [] : [`runIn "${String(manifest.runIn)}" is not "main" or "worker"`];
}
