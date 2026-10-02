import { describe, expect, it } from 'vitest';
import { parseArgs, readOption, USAGE } from './args.ts';

describe('readOption', () => {
  it('reads separate and inline values', () => {
    expect(readOption(['--family', 'hash'], 'family')).toBe('hash');
    expect(readOption(['--family=hash'], 'family')).toBe('hash');
    expect(readOption([], 'family')).toBeUndefined();
  });
});

describe('parseArgs', () => {
  it('parses primitives with a default or explicit family', () => {
    expect(parseArgs(['new', 'primitive', 'demo-xor'])).toEqual({ ok: true, command: { kind: 'primitive', id: 'demo-xor', family: 'block-cipher' } });
    expect(parseArgs(['new', 'primitive', 'sha-x', '--family', 'hash'])).toEqual({ ok: true, command: { kind: 'primitive', id: 'sha-x', family: 'hash' } });
  });

  it('parses views with default or explicit required facets', () => {
    expect(parseArgs(['new', 'view', 'demo-bits'])).toEqual({ ok: true, command: { kind: 'view', id: 'demo-bits', requires: ['state'] } });
    expect(parseArgs(['new', 'view', 'demo-bits', '--requires', 'state,values,state'])).toEqual({ ok: true, command: { kind: 'view', id: 'demo-bits', requires: ['state', 'values'] } });
  });

  it.each([
    [[], USAGE],
    [['new', 'primitive', 'Demo_Xor'], 'id "Demo_Xor" must be kebab-case, e.g. demo-xor'],
    [['new', 'lesson', 'x'], `unknown plugin kind "lesson"\n${USAGE}`],
    [['new', 'primitive', 'x', '--family', 'Block'], '--family must be kebab-case (got "Block")'],
    [['new', 'view', 'x', '--requires', 'state,'], '--requires must be a comma-separated list of facet kinds, e.g. state,values'],
  ])('rejects %j', (args, error) => {
    expect(parseArgs(args)).toEqual({ ok: false, error });
  });
});
