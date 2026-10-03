import { i18nRef, requirePort, type BlockCipher, type PrimitiveManifest, type ProducerLookup, type RunOptions } from '@cryventure/core';

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
