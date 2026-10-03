import { i18nRef, type I18nRef } from '../i18n.ts';
import { paramFieldsOf, portParamFields, type ParamFieldOption, type ParamFieldSource } from '../params.ts';
import type { BlockCipher, PortMap, PortName } from '../ports.ts';
import { compareById, type PrimitiveManifest } from '../registry.ts';

/**
 * Port plumbing for composites (docs/M3.md §2): a producer with a `port` param (e.g. `cipher`)
 * gets the implementation through a synchronous `resolve`, prepared once by `preparePorts`.
 */
export type PortResolver = <N extends PortName>(port: N, id: string) => PortMap[N] | undefined;

/** Looks producers up by id (a `Registry<PrimitiveManifest>` fits). */
export interface ProducerLookup {
  get(id: string): PrimitiveManifest | undefined;
}

export type RequirePortResult<N extends PortName> = { ok: true; port: PortMap[N] } | { ok: false; error: I18nRef };

/** The registered producers implementing `port`, sorted by id. */
function producersOf(producers: readonly PrimitiveManifest[], port: PortName): PrimitiveManifest[] {
  return producers.filter((producer) => producer.implements.includes(port)).sort(compareById);
}

/** Options of a `port` field: every producer implementing `port` (value = id, label = its title), sorted by id. */
export function portOptions(producers: readonly PrimitiveManifest[], port: PortName): ParamFieldOption[] {
  return producersOf(producers, port).map((producer) => ({ value: producer.id, labelKey: producer.titleKey }));
}

/** i18n namespaces of every producer a port param of `manifest` can name (labMessages loads them all). */
export function portNamespaces(manifest: ParamFieldSource, producers: readonly PrimitiveManifest[]): string[] {
  const ports = portParamFields(paramFieldsOf(manifest)).map((field) => field.port);
  const options = ports.flatMap((port) => producersOf(producers, port));
  return [...new Set(options.map((producer) => producer.i18nNamespace))];
}

const portKey = (port: PortName, id: string): string => `${port}:${id}`;

/** The port implementation of producer `id`, or `undefined` (unknown id, port not declared or not exposed, failed import). */
async function loadPort(producers: ProducerLookup, port: PortName, id: string): Promise<PortMap[PortName] | undefined> {
  const producer = producers.get(id);
  if (producer === undefined || !producer.implements.includes(port)) return undefined;
  try {
    return (await producer.load()).ports?.[port];
  } catch {
    return undefined;
  }
}

/**
 * Loads the producer modules named by `manifest`'s port params in `params` and returns the
 * synchronous resolver for `run(params, { resolve })`. Never throws: anything that cannot be
 * loaded resolves to `undefined`, which the run reports via `requirePort`.
 */
export async function preparePorts(manifest: ParamFieldSource, params: unknown, producers: ProducerLookup): Promise<PortResolver> {
  const record = typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {};
  const named = portParamFields(paramFieldsOf(manifest)).flatMap((field) => {
    const id = record[field.name];
    return typeof id === 'string' ? [{ port: field.port, id }] : [];
  });
  const loaded = await Promise.all(named.map(async ({ port, id }) => [portKey(port, id), await loadPort(producers, port, id)] as const));
  const ports = new Map(loaded.filter(([, implementation]) => implementation !== undefined));
  return <N extends PortName>(port: N, id: string) => ports.get(portKey(port, id)) as PortMap[N] | undefined;
}

/** The port `id` resolves to, or a `core.error.portMissing` run error. */
export function requirePort<N extends PortName>(resolve: PortResolver | undefined, port: N, id: string): RequirePortResult<N> {
  const implementation = resolve?.(port, id);
  return implementation === undefined ? { ok: false, error: i18nRef('core.error.portMissing', { id }) } : { ok: true, port: implementation };
}

/** A `core.error.keyLength` run error listing the cipher's key sizes, or `undefined` when `key` fits. */
export function checkKeyLength(cipher: Pick<BlockCipher, 'keySizes'>, key: ArrayLike<number>): I18nRef | undefined {
  return cipher.keySizes.includes(key.length) ? undefined : i18nRef('core.error.keyLength', { sizes: cipher.keySizes.join(', ') });
}
