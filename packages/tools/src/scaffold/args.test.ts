import { describe, expect, it } from 'vitest';
import { CORE_FACET_KINDS, parseArgs, readOption, USAGE } from './args.ts';

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

  it('parses derivers with a default or explicit from list and the provided kind', () => {
    expect(parseArgs(['new', 'deriver', 'demo-trace', '--provides', 'demo-steps'])).toEqual({ ok: true, command: { kind: 'deriver', id: 'demo-trace', from: ['state'], provides: 'demo-steps' } });
    expect(parseArgs(['new', 'deriver', 'demo-trace', '--from=state,values', '--provides=demo-steps'])).toEqual({ ok: true, command: { kind: 'deriver', id: 'demo-trace', from: ['state', 'values'], provides: 'demo-steps' } });
  });

  it.each(['memory', 'instructions', 'registers', 'field', 'chain', 'wire', 'math', 'table', 'state', 'values', 'narration', 'derivation'])(
    'rejects --provides %s, a core kind whose validator the demo facet would fail, listing the core kinds',
    (kind) => {
      const result = parseArgs(['new', 'deriver', 'x', '--provides', kind]);
      expect(result.ok).toBe(false);
      const error = result.ok ? '' : result.error;
      expect(error).toContain(`--provides "${kind}" is a core facet kind`);
      expect(error).toContain(CORE_FACET_KINDS.join(', '));
    },
  );

  it.each([
    [[], USAGE],
    [['new', 'deriver', 'x'], '--provides must name one facet kind, e.g. --provides demo-steps'],
    [['new', 'deriver', 'x', '--provides', 'Bad@kind'], '--provides must name one facet kind, e.g. --provides demo-steps'],
    [['new', 'deriver', 'x', '--from', 'values', '--provides', 'k'], '--from must be a comma-separated list of facet kinds that includes state, e.g. state,values'],
    [['new', 'primitive', 'Demo_Xor'], 'id "Demo_Xor" must be kebab-case, e.g. demo-xor'],
    [['new', 'lesson', 'x'], `unknown plugin kind "lesson"\n${USAGE}`],
    [['new', 'primitive', 'x', '--family', 'Block'], '--family must be kebab-case (got "Block")'],
    [['new', 'view', 'x', '--requires', 'state,'], '--requires must be a comma-separated list of facet kinds, e.g. state,values'],
  ])('rejects %j', (args, error) => {
    expect(parseArgs(args)).toEqual({ ok: false, error });
  });
});
