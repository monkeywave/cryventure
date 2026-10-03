import { bytesEqual, isPortName, readText, type BlockCipher, type ParamField, type PortMap, type PortName, type PrimitiveManifest, type PrimitiveModule } from '@cryventure/core';

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

/** The sanity check per port; the `Record` makes a new port without a check a type error. */
const PORT_SANITY: { [N in PortName]: (implementation: PortMap[N], producerId: string) => string[] } = {
  BlockCipher: blockCipherProblems,
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
