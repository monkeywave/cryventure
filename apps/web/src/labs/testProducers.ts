import { i18nRef, requirePort, requirePortMember, type BlockCipher, type HashFamily, type HashFunction, type PrimitiveManifest, type ProducerLookup, type RunOptions } from '@cryventure/core';

/** Test doubles: a cipher provider and a composite that names it through a `cipher` port param. */

export const fakeCipher: BlockCipher = {
  id: 'toy',
  blockSize: 1,
  keySizes: [1],
  encryptBlock: (key, block) => Uint8Array.of((block[0] ?? 0) ^ (key[0] ?? 0)),
  decryptBlock: (key, block) => Uint8Array.of((block[0] ?? 0) ^ (key[0] ?? 0)),
};

export const toyProvider = {
  kind: 'primitive',
  id: 'toy',
  implements: ['BlockCipher'],
  i18nNamespace: 'plugin.toy',
  titleKey: 'plugin.toy.title',
  load: async () => ({ run: () => ({ ok: false, error: i18nRef('x') }), ports: { BlockCipher: fakeCipher } }),
} as unknown as PrimitiveManifest;

/** Runs to a bundle whose output is the resolved cipher's id, or the `requirePort` error. */
export const toyComposite = {
  kind: 'primitive',
  id: 'toy-mode',
  implements: [],
  i18nNamespace: 'plugin.toy-mode',
  facets: [],
  presets: [],
  defaults: { cipher: 'toy' },
  validate: (params: unknown) => ({ ok: true, value: params }),
  paramFields: [{ name: 'cipher', kind: 'port', port: 'BlockCipher', labelKey: 'plugin.toy-mode.param.cipher' }],
  load: async () => ({
    run: (params: { cipher: string }, options?: RunOptions) => {
      const cipher = requirePort(options?.resolve, 'BlockCipher', params.cipher);
      if (!cipher.ok) return cipher;
      return { ok: true, trace: { schemaVersion: 1, producer: { kind: 'primitive', id: 'toy-mode', apiVersion: 1 }, provenance: 'modeled', params, facets: {}, output: { cipher: [cipher.port.blockSize] } } };
    },
  }),
} as unknown as PrimitiveManifest;

export const toyProducers: ProducerLookup & { list(): PrimitiveManifest[] } = {
  get: (id) => [toyProvider, toyComposite].find((producer) => producer.id === id),
  list: () => [toyProvider, toyComposite],
};

/** Test doubles for member ports (docs/M7.md §1b): a Hash family with one member, and a consumer naming it by member ref. */

const toyHashFunction = {
  id: 'toy-1',
  blockSize: 1,
  outputSize: 1,
  hash: (data: Uint8Array) => Uint8Array.of(data.reduce((sum, byte) => (sum + byte) & 0xff, 0)),
} as unknown as HashFunction;

export const toyHashFamily: HashFamily = { id: 'toy-hash', functions: [toyHashFunction] };

export const toyHashProvider = {
  kind: 'primitive',
  id: 'toy-hash',
  implements: ['Hash'],
  i18nNamespace: 'plugin.toy-hash',
  titleKey: 'plugin.toy-hash.title',
  portMembers: { Hash: [{ id: 'toy-1', labelKey: 'plugin.toy-hash.member.toy-1' }] },
  load: async () => ({ run: () => ({ ok: false, error: i18nRef('x') }), ports: { Hash: toyHashFamily } }),
} as unknown as PrimitiveManifest;

/** Runs to a bundle whose output is the named member's id and its digest of `[1, 2]`, or the `requirePortMember` error. */
export const toyMemberComposite = {
  kind: 'primitive',
  id: 'toy-kdf',
  implements: [],
  i18nNamespace: 'plugin.toy-kdf',
  facets: [],
  presets: [],
  defaults: { hash: 'toy-hash:toy-1' },
  validate: (params: unknown) => ({ ok: true, value: params }),
  paramFields: [{ name: 'hash', kind: 'port', port: 'Hash', member: true, labelKey: 'plugin.toy-kdf.param.hash' }],
  load: async () => ({
    run: (params: { hash: string }, options?: RunOptions) => {
      const hash = requirePortMember(options?.resolve, 'Hash', params.hash);
      if (!hash.ok) return hash;
      return { ok: true, trace: { schemaVersion: 1, producer: { kind: 'primitive', id: 'toy-kdf', apiVersion: 1 }, provenance: 'modeled', params, facets: {}, output: { member: hash.memberId, digest: [...hash.member.hash(Uint8Array.of(1, 2))] } } };
    },
  }),
} as unknown as PrimitiveManifest;

export const toyMemberProducers: ProducerLookup & { list(): PrimitiveManifest[] } = {
  get: (id) => [toyHashProvider, toyMemberComposite].find((producer) => producer.id === id),
  list: () => [toyHashProvider, toyMemberComposite],
};
