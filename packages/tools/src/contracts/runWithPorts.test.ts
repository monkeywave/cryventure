import { i18nRef, requirePort, toHex, type PrimitiveManifest, type PrimitiveModule, type RunOptions } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { describe, expect, it } from 'vitest';
import { primitiveProducers, producerRegistry, runOptionsFor, runWithPorts } from './runWithPorts.ts';

interface ModeParams {
  cipher: string;
}

/** A composite that encrypts the zero block under the zero key with the resolved cipher. */
const zeroBlockModule: PrimitiveModule<ModeParams> = {
  run: (params: ModeParams, options: RunOptions = {}) => {
    const port = requirePort(options.resolve, 'BlockCipher', params.cipher);
    if (!port.ok) return port;
    const { blockSize, keySizes } = port.port;
    const output = { ciphertext: [...port.port.encryptBlock(new Uint8Array(keySizes[0] ?? 0), new Uint8Array(blockSize))] };
    return { ok: true, trace: { schemaVersion: 1, producer: { kind: 'primitive', id: 'zero', apiVersion: 1 }, provenance: 'modeled', params, facets: {}, output } };
  },
};

const zeroMode = {
  kind: 'primitive',
  id: 'zero-mode',
  apiVersion: 1,
  family: 'mode',
  implements: [],
  titleKey: 'plugin.zero-mode.title',
  refs: [],
  facets: [],
  presets: [],
  defaults: { cipher: 'aes' },
  i18nNamespace: 'plugin.zero-mode',
  paramFields: [{ name: 'cipher', labelKey: 'plugin.zero-mode.param.cipher', kind: 'port', port: 'BlockCipher' }],
  validate: (params: unknown) => ({ ok: true, value: params as ModeParams }),
  load: async () => zeroBlockModule,
} satisfies PrimitiveManifest<ModeParams>;

describe('producerRegistry / primitiveProducers', () => {
  it('registers every manifest by id', () => {
    expect(producerRegistry(primitiveManifests).list().map((manifest) => manifest.id)).toEqual(primitiveManifests.map((manifest) => manifest.id));
    expect(primitiveProducers.get('aes')?.implements).toEqual(['BlockCipher']);
  });
});

describe('runOptionsFor', () => {
  it('prepares a resolver for the port params', async () => {
    const { resolve } = await runOptionsFor(zeroMode, { cipher: 'aes' });
    expect(resolve?.('BlockCipher', 'aes')?.id).toBe('aes');
  });
});

describe('runWithPorts', () => {
  it('runs a composite against the real registered cipher', async () => {
    const result = await runWithPorts(zeroMode, { cipher: 'aes' }, primitiveProducers);
    // FIPS 197 / SP 800-38A: AES-128 of the zero block under the zero key.
    expect(result.ok && toHex(result.trace.output['ciphertext'] ?? [])).toBe('66e94bd4ef8a2c3b884cfa59ca342b2e');
  });

  it('reports a producer that is not registered as a missing port', async () => {
    expect(await runWithPorts(zeroMode, { cipher: 'nope' }, primitiveProducers)).toEqual({ ok: false, error: i18nRef('core.error.portMissing', { id: 'nope' }) });
  });

  it('resolves against the given producers only', async () => {
    expect((await runWithPorts(zeroMode, { cipher: 'aes' }, producerRegistry([]))).ok).toBe(false);
  });
});
