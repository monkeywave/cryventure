import { describe, expect, it, vi } from 'vitest';
import { toyCipher } from '../modes/testCiphers.ts';
import type { ParamField } from '../params.ts';
import type { BlockCipher, HashFamily, HashFunction, MacFamily, MacFunction } from '../ports.ts';
import { Registry, type PrimitiveManifest, type PrimitiveModule } from '../registry.ts';
import { checkKeyLength, portNamespaces, portOptions, preparePorts, requirePort, requirePortMember, type PortResolver } from './ports.ts';

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
    expect(portOptions([toy, plain, aes], cipherField)).toEqual([
      { value: 'aes', labelKey: 'plugin.aes.title' },
      { value: 'toy', labelKey: 'plugin.toy.title' },
    ]);
  });
});

const unusedContext = () => { throw new Error('unused'); };
const hashFn = (id: string): HashFunction => ({ id, blockSize: 64, outputSize: 32, hash: () => new Uint8Array(32), create: unusedContext });
const macFn = (id: string, construction: MacFunction['construction']): MacFunction => ({
  id,
  outputSize: 32,
  blockSize: 64,
  keySizes: { min: 0 },
  customizable: false,
  variableOutput: false,
  construction,
  mac: () => new Uint8Array(32),
  create: unusedContext,
});
const shaHash: HashFamily = { id: 'sha', functions: [hashFn('sha-a'), hashFn('sha-b')] };
const shaMac: MacFamily = { id: 'sha', functions: [macFn('hmac-sha-a', { kind: 'hmac', hash: 'sha:sha-a' })] };
const sha: PrimitiveManifest = {
  ...producer('sha', ['Hash', 'Mac'], async () => ({ run, ports: { Hash: shaHash, Mac: shaMac } })),
  portMembers: {
    Hash: [{ id: 'sha-a', labelKey: 'plugin.sha.hash.a' }, { id: 'sha-b', labelKey: 'plugin.sha.hash.b' }],
    Mac: [{ id: 'hmac-sha-a', labelKey: 'plugin.sha.mac.a', construction: 'hmac' }],
  },
};
const kmac: PrimitiveManifest = {
  ...producer('kmac', ['Mac'], async () => ({ run, ports: { Mac: { id: 'kmac', functions: [macFn('kmac128', { kind: 'kmac' })] } } })),
  portMembers: { Mac: [{ id: 'kmac128', labelKey: 'plugin.kmac.mac.kmac128', construction: 'kmac' }] },
};
const macField: ParamField = { name: 'mac', labelKey: 'plugin.hkdf.param.mac', kind: 'port', port: 'Mac', member: true };
const hashField: ParamField = { name: 'hash', labelKey: 'plugin.hkdf.param.hash', kind: 'port', port: 'Hash', member: true };

describe('portOptions: member fields', () => {
  it('offers every declared member, sorted by producer id then declaration order', () => {
    expect(portOptions([sha, kmac, toy], macField)).toEqual([
      { value: 'kmac:kmac128', labelKey: 'plugin.kmac.mac.kmac128' },
      { value: 'sha:hmac-sha-a', labelKey: 'plugin.sha.mac.a' },
    ]);
    expect(portOptions([sha], hashField)).toEqual([
      { value: 'sha:sha-a', labelKey: 'plugin.sha.hash.a' },
      { value: 'sha:sha-b', labelKey: 'plugin.sha.hash.b' },
    ]);
  });

  it('filters by constructions (members without a construction never pass a filter)', () => {
    expect(portOptions([sha, kmac], { ...macField, constructions: ['hmac'] })).toEqual([{ value: 'sha:hmac-sha-a', labelKey: 'plugin.sha.mac.a' }]);
    expect(portOptions([sha], { ...hashField, constructions: ['hmac'] })).toEqual([]);
  });

  it('skips producers that implement the port without declaring members, and producers that do not implement it', () => {
    const undeclared = producer('md', ['Mac'], async () => ({ run }));
    const notImplementing = { ...producer('fake', [], async () => ({ run })), portMembers: kmac.portMembers };
    expect(portOptions([undeclared, notImplementing], macField)).toEqual([]);
  });

  it('offers nothing for a field without a port, or a member field on a port without members', () => {
    expect(portOptions([toy, sha], { port: undefined })).toEqual([]);
    expect(portOptions([toy], { ...cipherField, member: true })).toEqual([]);
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

describe('preparePorts: member fields', () => {
  const hkdf = { ...producer('hkdf', [], async () => ({ run })), paramFields: [macField, hashField], defaults: {} };

  it('loads the producer named by the ref\'s producer part', async () => {
    const resolve = await preparePorts(hkdf, { mac: 'sha:hmac-sha-a', hash: 'sha:sha-b' }, registryOf(sha, kmac));
    expect(resolve('Mac', 'sha')).toBe(shaMac);
    expect(resolve('Hash', 'sha')).toBe(shaHash);
    expect(resolve('Mac', 'kmac')).toBeUndefined();
  });

  it('loads nothing for a malformed ref', async () => {
    const load = vi.fn(async () => ({ run, ports: { Mac: shaMac } }));
    const resolve = await preparePorts(hkdf, { mac: 'sha', hash: 7 }, registryOf({ ...sha, load }));
    expect(load).not.toHaveBeenCalled();
    expect(resolve('Mac', 'sha')).toBeUndefined();
  });
});

describe('requirePortMember', () => {
  const resolve: PortResolver = (port, id) => (port === 'Mac' && id === 'sha' ? (shaMac as never) : undefined);

  it('returns the member with the parts of its ref', () => {
    expect(requirePortMember(resolve, 'Mac', 'sha:hmac-sha-a')).toEqual({ ok: true, member: shaMac.functions[0], producerId: 'sha', memberId: 'hmac-sha-a' });
  });

  it('reports a member the family does not offer with core.error.portMemberMissing', () => {
    expect(requirePortMember(resolve, 'Mac', 'sha:hmac-sha-z')).toEqual({ ok: false, error: { key: 'core.error.portMemberMissing', params: { id: 'sha:hmac-sha-z' } } });
  });

  it('reports a missing producer or a malformed ref with core.error.portMissing', () => {
    expect(requirePortMember(resolve, 'Mac', 'kmac:kmac128')).toEqual({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'kmac' } } });
    expect(requirePortMember(resolve, 'Hash', 'sha:sha-a')).toEqual({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'sha' } } });
    expect(requirePortMember(undefined, 'Mac', 'sha:hmac-sha-a')).toEqual({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'sha' } } });
    expect(requirePortMember(resolve, 'Mac', 'sha')).toEqual({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'sha' } } });
  });

  it('reports a producer whose module failed to load with core.error.portLoadFailed', async () => {
    const broken = producer('broken', ['Mac'], () => Promise.reject(new Error('chunk failed')));
    const hmacField = { ...producer('hmac', [], async () => ({ run })), paramFields: [macField], defaults: {} };
    const failed = await preparePorts(hmacField, { mac: 'broken:hmac-x' }, registryOf(broken));
    expect(requirePortMember(failed, 'Mac', 'broken:hmac-x')).toEqual({ ok: false, error: { key: 'core.error.portLoadFailed', params: { id: 'broken' } } });
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
