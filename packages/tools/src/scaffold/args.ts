import { isKebabCase } from './naming.ts';

/** Parsed `cv new …` command. */
export type ScaffoldCommand =
  | { kind: 'primitive'; id: string; family: string }
  | { kind: 'view'; id: string; requires: string[] };

export type ParseResult = { ok: true; command: ScaffoldCommand } | { ok: false; error: string };

export const USAGE = [
  'Usage:',
  '  pnpm cv new primitive <id> [--family block-cipher]',
  '  pnpm cv new view <id> [--requires state[,values]]',
].join('\n');

const DEFAULT_FAMILY = 'block-cipher';
const DEFAULT_REQUIRES = ['state'];
const FACET_KIND = /^[a-z][a-z0-9-]*$/;

/** Value of `--name value` or `--name=value`; undefined when absent. */
export function readOption(args: readonly string[], name: string): string | undefined {
  const flag = `--${name}`;
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  if (inline !== undefined) return inline.slice(flag.length + 1);
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseRequires(value: string | undefined): string[] | undefined {
  const kinds = (value ?? DEFAULT_REQUIRES.join(',')).split(',').map((kind) => kind.trim());
  return kinds.length > 0 && kinds.every((kind) => FACET_KIND.test(kind)) ? [...new Set(kinds)] : undefined;
}

function parseView(id: string, args: readonly string[]): ParseResult {
  const requires = parseRequires(readOption(args, 'requires'));
  if (requires === undefined) return { ok: false, error: '--requires must be a comma-separated list of facet kinds, e.g. state,values' };
  return { ok: true, command: { kind: 'view', id, requires } };
}

function parsePrimitive(id: string, args: readonly string[]): ParseResult {
  const family = readOption(args, 'family') ?? DEFAULT_FAMILY;
  if (!isKebabCase(family)) return { ok: false, error: `--family must be kebab-case (got "${family}")` };
  return { ok: true, command: { kind: 'primitive', id, family } };
}

/** Parses `new <primitive|view> <id> [options]` (argv without the node/script prefix). */
export function parseArgs(args: readonly string[]): ParseResult {
  const [verb, kind, id] = args;
  if (verb !== 'new' || id === undefined) return { ok: false, error: USAGE };
  if (!isKebabCase(id)) return { ok: false, error: `id "${id}" must be kebab-case, e.g. demo-xor` };
  if (kind === 'primitive') return parsePrimitive(id, args.slice(3));
  if (kind === 'view') return parseView(id, args.slice(3));
  return { ok: false, error: `unknown plugin kind "${kind ?? ''}"\n${USAGE}` };
}
