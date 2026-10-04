import { bytesEqual, isPortName, readText, type BlockCipher, type HashFamily, type HashFunction, type ParamField, type PortMap, type PortName, type PrimitiveManifest, type PrimitiveModule, type XofContext, type XofCustomization, type XofFunction } from '@cryventure/core';

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

function hashSplitProblems(fn: HashFunction): string[] {
  return hashSplits(fn.blockSize).flatMap(({ name, length, parts }) => {
    const data = testBytes(length, HASH_INPUT_SEED);
    const where = `Hash ${fn.id}: create() + update (${name}, ${length} bytes)`;
    return guarded(where, () => (bytesEqual(absorbAll(fn.create(), parts(data)).digest(), fn.hash(data)) ? [] : [`${where} differs from hash()`]));
  });
}

/** `digest()` twice gives the same bytes and does not stop `update`. */
function hashDigestTwiceProblems(fn: HashFunction): string[] {
  const where = `Hash ${fn.id}: digest()`;
  return guarded(where, () => {
    const data = testBytes(fn.blockSize + 1, HASH_INPUT_SEED);
    const context = absorbAll(fn.create(), [data.subarray(0, 1)]);
    const first = context.digest();
    const problems = bytesEqual(first, context.digest()) ? [] : [`${where} twice gives different bytes`];
    context.update(data.subarray(1));
    return bytesEqual(context.digest(), fn.hash(data)) ? problems : [...problems, `${where} stops a later update from counting`];
  });
}

/** A clone taken after `prefix` is independent of its source in both directions. */
function hashCloneProblems(fn: HashFunction): string[] {
  const where = `Hash ${fn.id}: clone()`;
  return guarded(where, () => {
    const prefix = testBytes(fn.blockSize + 1, HASH_INPUT_SEED);
    const source = absorbAll(fn.create(), [prefix]);
    const clone = source.clone();
    source.update(Uint8Array.of(1));
    const cloneUnchanged = bytesEqual(clone.digest(), fn.hash(prefix));
    clone.update(Uint8Array.of(2));
    const sourceUnchanged = bytesEqual(source.digest(), fn.hash(Uint8Array.of(...prefix, 1)));
    return cloneUnchanged && sourceUnchanged ? [] : [`${where} is not independent of its source`];
  });
}

function hashContextProblems(fn: HashFunction): string[] {
  if (typeof fn.create !== 'function') return [`Hash ${fn.id}: create is not a function`];
  return [...hashSplitProblems(fn), ...hashDigestTwiceProblems(fn), ...hashCloneProblems(fn)];
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

function xofFunctionProblems(xof: XofFunction): string[] {
  if (!isPositiveInteger(xof.blockSize)) return [`Hash ${xof.id}: blockSize ${xof.blockSize} is not a positive integer`];
  if (!isPositiveInteger(xof.securityBits)) return [`Hash ${xof.id}: securityBits ${xof.securityBits} is not a positive integer`];
  return [...xofSqueezeProblems(xof), ...xofContextProblems(xof), ...xofCustomizationProblems(xof)];
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

/** The sanity check per port; the `Record` makes a new port without a check a type error. */
const PORT_SANITY: { [N in PortName]: (implementation: PortMap[N], producerId: string) => string[] } = {
  BlockCipher: blockCipherProblems,
  Hash: hashFamilyProblems,
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

/** `port` fields name a real port that at least one registered producer implements. */
export function portFieldProblems(fields: readonly ParamField[], producers: readonly Pick<PrimitiveManifest, 'implements'>[]): string[] {
  return fields
    .filter((field) => field.kind === 'port')
    .flatMap((field) => {
      const { port } = field;
      if (!isPortName(port)) return [`param "${field.name}": "${String(port)}" is not a port name`];
      const implemented = producers.some((producer) => producer.implements.includes(port));
      return implemented ? [] : [`param "${field.name}": no registered producer implements port "${port}"`];
    });
}

interface ParamCase {
  name: string;
  params: unknown;
}

/** `text` fields have a positive integer `maxLength`, and every case's value fits it. */
export function textFieldProblems(fields: readonly ParamField[], cases: readonly ParamCase[]): string[] {
  return fields
    .filter((field) => field.kind === 'text')
    .flatMap((field) => {
      const { maxLength } = field;
      if (maxLength === undefined || !isPositiveInteger(maxLength)) return [`param "${field.name}": maxLength ${maxLength} is not a positive integer`];
      return cases
        .filter(({ params }) => readText((params as Record<string, unknown> | null)?.[field.name], maxLength) === undefined)
        .map(({ name }) => `${name}: param "${field.name}" is not a string of at most ${maxLength} UTF-8 bytes`);
    });
}

const RUN_IN: readonly unknown[] = [undefined, 'main', 'worker'];

/** `runIn` is absent, `'main'` or `'worker'`. */
export function runInProblems(manifest: Pick<PrimitiveManifest, 'runIn'>): string[] {
  return RUN_IN.includes(manifest.runIn) ? [] : [`runIn "${String(manifest.runIn)}" is not "main" or "worker"`];
}
