import { bytesEqual, isPortName, readText, type BlockCipher, type HashFamily, type HashFunction, type ParamField, type PortMap, type PortName, type PrimitiveManifest, type PrimitiveModule } from '@cryventure/core';

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

const HASH_BLOCK_SIZES: readonly number[] = [64, 128];

const HASH_INPUT_SEED = 5;

/** Digests of the same input twice (the given buffer, then a pristine copy), or the reason hashing threw. */
function digestPair(fn: HashFunction, data: Uint8Array): [Uint8Array, Uint8Array] | string {
  const pristine = data.slice();
  try {
    return [fn.hash(data), fn.hash(pristine.slice())];
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
 * once all three digests are well-formed, they must be pairwise distinct.
 */
function hashFunctionProblems(fn: HashFunction): string[] {
  if (!HASH_BLOCK_SIZES.includes(fn.blockSize)) return [`Hash ${fn.id}: blockSize ${fn.blockSize} is not 64 or 128`];
  if (!isPositiveInteger(fn.outputSize)) return [`Hash ${fn.id}: outputSize ${fn.outputSize} is not a positive integer`];
  const lengths = [0, 1, fn.blockSize];
  const checks = lengths.map((length) => digestCheck(fn, length));
  const problems = checks.flatMap((check) => check.problems);
  const digests = checks.map((check) => check.digest).filter((digest) => digest !== undefined);
  return digests.length === lengths.length ? [...problems, ...collisionProblems(fn, lengths, digests)] : problems;
}

function duplicateIds(functions: readonly HashFunction[]): string[] {
  const ids = functions.map((fn) => fn.id);
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}

/** Family id = producer id, at least one function, unique function ids, and every function sane (docs/M5.md §1). */
export function hashFamilyProblems(family: HashFamily, producerId: string): string[] {
  const problems = family.id === producerId ? [] : [`Hash: family id "${family.id}" is not the producer id "${producerId}"`];
  if (family.functions.length === 0) return [...problems, 'Hash: functions is empty'];
  problems.push(...duplicateIds(family.functions).map((id) => `Hash: function id "${id}" is not unique`));
  return [...problems, ...family.functions.flatMap(hashFunctionProblems)];
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
