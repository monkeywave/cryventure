import { isKebabCase } from './naming.ts';

/** Parsed `cv new …` command. */
export type ScaffoldCommand =
  | { kind: 'primitive'; id: string; family: string }
  | { kind: 'view'; id: string; requires: string[] }
  | { kind: 'deriver'; id: string; from: string[]; provides: string };

export type ParseResult = { ok: true; command: ScaffoldCommand } | { ok: false; error: string };

export const USAGE = [
  'Usage:',
  '  pnpm cv new primitive <id> [--family block-cipher]',
  '  pnpm cv new view <id> [--requires state[,values]]',
  '  pnpm cv new deriver <id> --provides <kind> [--from state[,values]]',
].join('\n');

const DEFAULT_FAMILY = 'block-cipher';
const DEFAULT_REQUIRES = ['state'];
const DEFAULT_FROM = ['state'];
const FACET_KIND = /^[a-z][a-z0-9-]*$/;

/**
 * Facet kinds core defines a schema (and mostly a validator) for: the demo facet of the deriver
 * template (`{ kind, schemaVersion, label, steps }`) would be an invalid facet of any of them.
 */
export const CORE_FACET_KINDS: readonly string[] = [
  'state',
  'values',
  'narration',
  'instructions',
  'registers',
  'memory',
  'derivation',
  'messages',
  'packets',
  'filesystem',
  'math',
  'field',
  'table',
  'chain',
  'wire',
];

/** Value of `--name value` or `--name=value`; undefined when absent. */
export function readOption(args: readonly string[], name: string): string | undefined {
  const flag = `--${name}`;
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  if (inline !== undefined) return inline.slice(flag.length + 1);
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

/** A comma-separated list of facet kinds (deduplicated), `fallback` when absent; undefined when malformed. */
function parseKinds(value: string | undefined, fallback: readonly string[]): string[] | undefined {
  const kinds = (value ?? fallback.join(',')).split(',').map((kind) => kind.trim());
  return kinds.length > 0 && kinds.every((kind) => FACET_KIND.test(kind)) ? [...new Set(kinds)] : undefined;
}

function parseView(id: string, args: readonly string[]): ParseResult {
  const requires = parseKinds(readOption(args, 'requires'), DEFAULT_REQUIRES);
  if (requires === undefined) return { ok: false, error: '--requires must be a comma-separated list of facet kinds, e.g. state,values' };
  return { ok: true, command: { kind: 'view', id, requires } };
}

function parsePrimitive(id: string, args: readonly string[]): ParseResult {
  const family = readOption(args, 'family') ?? DEFAULT_FAMILY;
  if (!isKebabCase(family)) return { ok: false, error: `--family must be kebab-case (got "${family}")` };
  return { ok: true, command: { kind: 'primitive', id, family } };
}

function coreKindError(provides: string): string {
  return [
    `--provides "${provides}" is a core facet kind; the template's demo facet would fail its core schema.`,
    'Scaffold with a new kind (e.g. --provides demo-steps), then reshape the facet and change provides by hand.',
    `Core facet kinds: ${CORE_FACET_KINDS.join(', ')}`,
  ].join('\n');
}

function parseDeriver(id: string, args: readonly string[]): ParseResult {
  const from = parseKinds(readOption(args, 'from'), DEFAULT_FROM);
  if (from === undefined || !from.includes('state')) return { ok: false, error: '--from must be a comma-separated list of facet kinds that includes state, e.g. state,values' };
  const provides = readOption(args, 'provides');
  if (provides === undefined || !FACET_KIND.test(provides)) return { ok: false, error: '--provides must name one facet kind, e.g. --provides demo-steps' };
  if (CORE_FACET_KINDS.includes(provides)) return { ok: false, error: coreKindError(provides) };
  return { ok: true, command: { kind: 'deriver', id, from, provides } };
}

/** Parses `new <primitive|view|deriver> <id> [options]` (argv without the node/script prefix). */
export function parseArgs(args: readonly string[]): ParseResult {
  const [verb, kind, id] = args;
  if (verb !== 'new' || id === undefined) return { ok: false, error: USAGE };
  if (!isKebabCase(id)) return { ok: false, error: `id "${id}" must be kebab-case, e.g. demo-xor` };
  if (kind === 'primitive') return parsePrimitive(id, args.slice(3));
  if (kind === 'view') return parseView(id, args.slice(3));
  if (kind === 'deriver') return parseDeriver(id, args.slice(3));
  return { ok: false, error: `unknown plugin kind "${kind ?? ''}"\n${USAGE}` };
}
