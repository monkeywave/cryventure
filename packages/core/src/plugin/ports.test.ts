import { describe, expect, it, vi } from 'vitest';
import { toyCipher } from '../modes/testCiphers.ts';
import type { ParamField } from '../params.ts';
import type { BlockCipher } from '../ports.ts';
import { Registry, type PrimitiveManifest, type PrimitiveModule } from '../registry.ts';
import { checkKeyLength, portNamespaces, portOptions, preparePorts, requirePort, type PortResolver } from './ports.ts';

const cipherField: ParamField = { name: 'cipher', labelKey: 'plugin.cbc.param.cipher', kind: 'port', port: 'BlockCipher' };

function producer(id: string, implementsPorts: PrimitiveManifest['implements'], load: () => Promise<PrimitiveModule<unknown>>): PrimitiveManifest {
  return {
    kind: 'primitive',
    id,
    apiVersion: 1,
    family: 'block-cipher',
    implements: implementsPorts,
    titleKey: `plugin.${id}.title`,
    refs: [],
    facets: [],
    presets: [],
    defaults: {},
    i18nNamespace: `plugin.${id}`,
    validate: (params) => ({ ok: true, value: params }),
    load,
  };
}

const run = () => ({ ok: false as const, error: { key: 'x' } });
const toy = producer('toy', ['BlockCipher'], async () => ({ run, ports: { BlockCipher: toyCipher } }));
const aes = producer('aes', ['BlockCipher'], async () => ({ run, ports: { BlockCipher: { ...toyCipher, id: 'aes' } } }));
const plain = producer('xor', [], async () => ({ run, ports: { BlockCipher: toyCipher } }));
const mode = { ...producer('cbc', [], async () => ({ run })), paramFields: [cipherField], defaults: { cipher: 'aes' } };

function registryOf(...manifests: PrimitiveManifest[]): Registry<PrimitiveManifest> {
  const registry = new Registry<PrimitiveManifest>('test');
  manifests.forEach((manifest) => registry.register(manifest));
  return registry;
}

describe('portOptions', () => {
  it('offers the producers implementing the port, labelled by title and sorted by id', () => {
    expect(portOptions([toy, plain, aes], 'BlockCipher')).toEqual([
      { value: 'aes', labelKey: 'plugin.aes.title' },
      { value: 'toy', labelKey: 'plugin.toy.title' },
    ]);
  });
});

describe('portNamespaces', () => {
  it('lists the namespaces of every option of the port params', () => {
    expect(portNamespaces(mode, [toy, plain, aes])).toEqual(['plugin.aes', 'plugin.toy']);
  });

  it('is empty without port params', () => expect(portNamespaces(plain, [toy, aes])).toEqual([]));
});

describe('preparePorts', () => {
  it('resolves the port named by the param', async () => {
    const resolve = await preparePorts(mode, { cipher: 'toy' }, registryOf(toy, aes, plain));
    expect(resolve('BlockCipher', 'toy')).toBe(toyCipher);
    expect(resolve('BlockCipher', 'aes')).toBeUndefined();
  });

  it('loads only the producers named by port params', async () => {
    const load = vi.fn(async () => ({ run, ports: { BlockCipher: toyCipher } }));
    await preparePorts(mode, { cipher: 'toy' }, registryOf(toy, producer('aes', ['BlockCipher'], load)));
    expect(load).not.toHaveBeenCalled();
  });

  it('does not resolve producers that do not declare the port', async () => {
    const resolve = await preparePorts(mode, { cipher: 'xor' }, registryOf(plain));
    expect(resolve('BlockCipher', 'xor')).toBeUndefined();
  });

  it('does not resolve unknown ids, non-string values or modules without the port', async () => {
    const bare = producer('bare', ['BlockCipher'], async () => ({ run }));
    const registry = registryOf(bare);
    expect((await preparePorts(mode, { cipher: 'nope' }, registry))('BlockCipher', 'nope')).toBeUndefined();
    expect((await preparePorts(mode, { cipher: 7 }, registry))('BlockCipher', '7')).toBeUndefined();
    expect((await preparePorts(mode, null, registry))('BlockCipher', 'bare')).toBeUndefined();
    expect((await preparePorts(mode, { cipher: 'bare' }, registry))('BlockCipher', 'bare')).toBeUndefined();
  });

  it('never throws when a producer module fails to load', async () => {
    const broken = producer('broken', ['BlockCipher'], () => Promise.reject(new Error('chunk failed')));
    const resolve = await preparePorts(mode, { cipher: 'broken' }, registryOf(broken));
    expect(resolve('BlockCipher', 'broken')).toBeUndefined();
  });

  it('reports a module that fails to load as core.error.portLoadFailed, not portMissing', async () => {
    const broken = producer('broken', ['BlockCipher'], () => Promise.reject(new Error('chunk failed')));
    const resolve = await preparePorts(mode, { cipher: 'broken' }, registryOf(broken, toy));
    expect(requirePort(resolve, 'BlockCipher', 'broken')).toEqual({ ok: false, error: { key: 'core.error.portLoadFailed', params: { id: 'broken' } } });
    const unknown = await preparePorts(mode, { cipher: 'nope' }, registryOf(broken));
    expect(requirePort(unknown, 'BlockCipher', 'nope')).toEqual({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'nope' } } });
  });
});

describe('requirePort', () => {
  const resolve: PortResolver = (port, id) => (port === 'BlockCipher' && id === 'toy' ? (toyCipher as never) : undefined);

  it('returns the resolved port', () => expect(requirePort(resolve, 'BlockCipher', 'toy')).toEqual({ ok: true, port: toyCipher }));

  it('reports a missing port with core.error.portMissing', () => {
    expect(requirePort(resolve, 'BlockCipher', 'aes')).toEqual({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'aes' } } });
    expect(requirePort(undefined, 'BlockCipher', 'toy')).toEqual({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'toy' } } });
  });
});

describe('checkKeyLength', () => {
  const cipher: Pick<BlockCipher, 'keySizes'> = { keySizes: [16, 24, 32] };

  it('accepts a key of a supported size', () => expect(checkKeyLength(cipher, new Uint8Array(24))).toBeUndefined());

  it('reports the supported sizes for a wrong key length', () => {
    expect(checkKeyLength(cipher, new Uint8Array(15))).toEqual({ key: 'core.error.keyLength', params: { sizes: '16, 24, 32' } });
  });
});
