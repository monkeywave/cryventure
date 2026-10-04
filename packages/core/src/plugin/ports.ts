import { i18nRef, type I18nRef } from '../i18n.ts';
import { paramFieldsOf, portParamFields, type ParamField, type ParamFieldOption, type ParamFieldSource, type PortParamField } from '../params.ts';
import { isMemberPortName, parsePortMemberRef, portMember, portMemberRef, type BlockCipher, type MemberPortName, type PortMap, type PortMemberMap, type PortName } from '../ports.ts';
import { compareById, type PortMemberDecl, type PrimitiveManifest } from '../registry.ts';

/**
 * Port plumbing for composites (docs/M3.md §2): a producer with a `port` param (e.g. `cipher`)
 * gets the implementation through a synchronous `resolve`, prepared once by `preparePorts`.
 */
export type PortResolver = (<N extends PortName>(port: N, id: string) => PortMap[N] | undefined) & {
  /** Whether the module behind `port`/`id` failed to load (set by `preparePorts`; see `requirePort`). */
  readonly failed?: (port: PortName, id: string) => boolean;
};

/** Looks producers up by id (a `Registry<PrimitiveManifest>` fits). */
export interface ProducerLookup {
  get(id: string): PrimitiveManifest | undefined;
}

export type RequirePortResult<N extends PortName> = { ok: true; port: PortMap[N] } | { ok: false; error: I18nRef };

export type RequirePortMemberResult<N extends MemberPortName> =
  | { ok: true; member: PortMemberMap[N]; producerId: string; memberId: string }
  | { ok: false; error: I18nRef };

/** The registered producers implementing `port`, sorted by id. */
function producersOf(producers: readonly PrimitiveManifest[], port: PortName): PrimitiveManifest[] {
  return producers.filter((producer) => producer.implements.includes(port)).sort(compareById);
}

/** The field's `constructions` filter admits `member` (no filter admits every member). */
function admitsConstruction(field: Pick<ParamField, 'constructions'>, member: PortMemberDecl): boolean {
  return field.constructions === undefined || (member.construction !== undefined && field.constructions.includes(member.construction));
}

/** Options of a member field: every declared member of every producer implementing `port` (value = member ref, label = member label). */
function memberOptions(producers: readonly PrimitiveManifest[], field: Pick<ParamField, 'constructions'>, port: MemberPortName): ParamFieldOption[] {
  return producersOf(producers, port).flatMap((producer) =>
    (producer.portMembers?.[port] ?? []).filter((member) => admitsConstruction(field, member)).map((member) => ({ value: portMemberRef(producer.id, member.id), labelKey: member.labelKey })),
  );
}

/**
 * Options of a `port` field: every producer implementing its port (value = id, label = its title),
 * sorted by id; for a member field, one option per declared member (docs/M7.md §1b), filtered by
 * `constructions`, sorted by producer id then declaration order. None without a port.
 */
export function portOptions(producers: readonly PrimitiveManifest[], field: Pick<ParamField, 'port' | 'member' | 'constructions'>): ParamFieldOption[] {
  const { port } = field;
  if (port === undefined) return [];
  if (field.member === true) return isMemberPortName(port) ? memberOptions(producers, field, port) : [];
  return producersOf(producers, port).map((producer) => ({ value: producer.id, labelKey: producer.titleKey }));
}

/** i18n namespaces of every producer a port param of `manifest` can name (labMessages loads them all). */
export function portNamespaces(manifest: ParamFieldSource, producers: readonly PrimitiveManifest[]): string[] {
  const ports = portParamFields(paramFieldsOf(manifest)).map((field) => field.port);
  const options = ports.flatMap((port) => producersOf(producers, port));
  return [...new Set(options.map((producer) => producer.i18nNamespace))];
}

const portKey = (port: PortName, id: string): string => `${port}:${id}`;

/** A loaded port, `undefined` (unknown id, port not declared or not exposed) or `LOAD_FAILED` (the import threw). */
const LOAD_FAILED = Symbol('portLoadFailed');
type LoadedPort = PortMap[PortName] | undefined | typeof LOAD_FAILED;

async function loadPort(producers: ProducerLookup, port: PortName, id: string): Promise<LoadedPort> {
  const producer = producers.get(id);
  if (producer === undefined || !producer.implements.includes(port)) return undefined;
  try {
    return (await producer.load()).ports?.[port];
  } catch {
    return LOAD_FAILED;
  }
}

/** The producer id a port param value names: the value itself, or a member ref's producer part. */
function namedProducerId(field: PortParamField, value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return field.member === true ? parsePortMemberRef(value)?.producerId : value;
}

/**
 * Loads the producer modules named by `manifest`'s port params in `params` and returns the
 * synchronous resolver for `run(params, { resolve })`. Never throws: anything that cannot be
 * loaded resolves to `undefined`, which the run reports via `requirePort`; a module whose import
 * threw is also listed by `resolve.failed`.
 */
export async function preparePorts(manifest: ParamFieldSource, params: unknown, producers: ProducerLookup): Promise<PortResolver> {
  const record = typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {};
  const named = portParamFields(paramFieldsOf(manifest)).flatMap((field) => {
    const id = namedProducerId(field, record[field.name]);
    return id === undefined ? [] : [{ port: field.port, id }];
  });
  const loaded = await Promise.all(named.map(async ({ port, id }) => [portKey(port, id), await loadPort(producers, port, id)] as const));
  const ports = new Map(loaded.filter(([, implementation]) => implementation !== undefined));
  const resolve = <N extends PortName>(port: N, id: string) => {
    const implementation = ports.get(portKey(port, id));
    return implementation === LOAD_FAILED ? undefined : (implementation as PortMap[N] | undefined);
  };
  return Object.assign(resolve, { failed: (port: PortName, id: string) => ports.get(portKey(port, id)) === LOAD_FAILED });
}

/** The port `id` resolves to, or a `core.error.portLoadFailed` (its module failed to load) / `core.error.portMissing` run error. */
export function requirePort<N extends PortName>(resolve: PortResolver | undefined, port: N, id: string): RequirePortResult<N> {
  const implementation = resolve?.(port, id);
  if (implementation !== undefined) return { ok: true, port: implementation };
  const key = resolve?.failed?.(port, id) === true ? 'core.error.portLoadFailed' : 'core.error.portMissing';
  return { ok: false, error: i18nRef(key, { id }) };
}

/**
 * The member a ref `"<producerId>:<memberId>"` names, with its parts, or a run error:
 * `core.error.portMissing` / `core.error.portLoadFailed` for the producer (a malformed ref is
 * missing), `core.error.portMemberMissing` when the loaded family does not offer the member.
 */
export function requirePortMember<N extends MemberPortName>(resolve: PortResolver | undefined, port: N, ref: string): RequirePortMemberResult<N> {
  const parts = parsePortMemberRef(ref);
  if (parts === undefined) return { ok: false, error: i18nRef('core.error.portMissing', { id: ref }) };
  const family = requirePort(resolve, port, parts.producerId);
  if (!family.ok) return family;
  const member = portMember(port, family.port, parts.memberId);
  return member === undefined ? { ok: false, error: i18nRef('core.error.portMemberMissing', { id: ref }) } : { ok: true, member, ...parts };
}

/** A `core.error.keyLength` run error listing the cipher's key sizes, or `undefined` when `key` fits. */
export function checkKeyLength(cipher: Pick<BlockCipher, 'keySizes'>, key: ArrayLike<number>): I18nRef | undefined {
  return cipher.keySizes.includes(key.length) ? undefined : i18nRef('core.error.keyLength', { sizes: cipher.keySizes.join(', ') });
}
