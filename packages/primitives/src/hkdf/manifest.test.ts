import { describe, expect, it } from 'vitest';
import { hmacMemberField } from '../_lib/hmac/manifestKit.ts';
import {
  HKDF_LIMITS,
  HKDF_PARAM_FIELDS,
  hkdfManifest,
  readHexUpTo,
  readInfo,
  readLabel,
  readOutputLength,
  validateHkdfParams,
  type HkdfParams,
} from './manifest.ts';

const NS = 'plugin.hkdf';
const BASE = hkdfManifest.defaults;
const error = (name: string, params?: Record<string, number>) => ({
  ok: false,
  error:
    params === undefined ? { key: `${NS}.error.${name}` } : { key: `${NS}.error.${name}`, params },
});

describe('readHexUpTo', () => {
  it('normalises hex and accepts 0 … max bytes', () => {
    expect(readHexUpTo('AB:cd', 'salt', 2)).toEqual({ ok: true, value: 'abcd' });
    expect(readHexUpTo('', 'salt', 2)).toEqual({ ok: true, value: '' });
  });

  it('reports a wrong length under <name>Length', () => {
    expect(readHexUpTo('000000', 'salt', 2)).toEqual(error('saltLength', { length: 3 }));
  });

  it('reports non-strings as invalid params and keeps core hex errors', () => {
    expect(readHexUpTo(5, 'salt', 2)).toEqual(error('invalidParams'));
    const bad = readHexUpTo('zz', 'salt', 2);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.key).toMatch(/^core\.error\.hex/);
  });
});

describe('readInfo', () => {
  it('reads UTF-8 text of at most 128 bytes', () => {
    expect(readInfo('ä', 'utf8')).toEqual({ ok: true, value: 'ä' });
    expect(readInfo('a'.repeat(128), 'utf8').ok).toBe(true);
    expect(readInfo('ä'.repeat(65), 'utf8')).toEqual(error('infoLength', { length: 130 }));
    expect(readInfo(1, 'utf8')).toEqual(error('invalidParams'));
  });

  it('reads hex of at most 128 bytes', () => {
    expect(readInfo('F0F1', 'hex')).toEqual({ ok: true, value: 'f0f1' });
    expect(readInfo('00'.repeat(129), 'hex')).toEqual(error('infoLength', { length: 129 }));
  });
});

describe('readOutputLength', () => {
  it.each([
    ['1', '1'],
    ['42', '42'],
    ['007', '7'],
    ['0042', '42'],
    ['255', '255'],
  ])('accepts %j as %j (digits only, leading zeros dropped)', (input, value) =>
    expect(readOutputLength(input)).toEqual({ ok: true, value }),
  );

  it.each(['0', '256', '', '4.2', '-1', '+1', 'abc', '1000', ' 42 ', '42 ', '1e2', 42])('rejects %j', (input) =>
    expect(readOutputLength(input)).toEqual(error('length')),
  );
});

describe('readLabel', () => {
  it('accepts up to 249 bytes', () => {
    expect(readLabel('derived', 'expand-label')).toEqual({ ok: true, value: 'derived' });
    expect(readLabel('x'.repeat(HKDF_LIMITS.label), 'expand-label').ok).toBe(true);
    expect(readLabel('x'.repeat(250), 'expand-label')).toEqual(
      error('labelLength', { length: 250 }),
    );
    expect(readLabel(null, 'hkdf')).toEqual(error('invalidParams'));
  });

  it('requires a label only in expand-label mode', () => {
    expect(readLabel('', 'expand-label')).toEqual(error('labelEmpty'));
    expect(readLabel('', 'hkdf')).toEqual({ ok: true, value: '' });
  });
});

describe('validateHkdfParams', () => {
  it('normalises hex fields and the length', () => {
    const input = {
      ...BASE,
      ikm: BASE.ikm.toUpperCase(),
      salt: '00 01',
      context: 'AA',
      length: '042',
    };
    expect(validateHkdfParams(input)).toEqual({
      ok: true,
      value: { ...BASE, salt: '0001', context: 'aa', length: '42' },
    });
  });

  it('accepts every preset and the defaults', () => {
    for (const preset of hkdfManifest.presets)
      expect(validateHkdfParams(preset.params), preset.id).toEqual({
        ok: true,
        value: preset.params,
      });
    expect(hkdfManifest.defaults).toEqual(hkdfManifest.presets[0]!.params);
  });

  it.each<[Partial<Record<keyof HkdfParams, unknown>>, ReturnType<typeof error>]>([
    [{ mac: 'sha256' }, error('mac')],
    [{ mac: 'SHA256:hmac' }, error('mac')],
    [{ mode: 'derive' }, error('mode')],
    [{ infoEncoding: 'base64' }, error('infoEncoding')],
    [{ ikm: '00'.repeat(129) }, error('ikmLength', { length: 129 })],
    [{ salt: '00'.repeat(129) }, error('saltLength', { length: 129 })],
    [{ prk: '00'.repeat(129) }, error('prkLength', { length: 129 })],
    [{ context: '00'.repeat(256) }, error('contextLength', { length: 256 })],
    [{ info: '00'.repeat(129) }, error('infoLength', { length: 129 })],
    [{ length: '0' }, error('length')],
    [{ length: '256' }, error('length')],
    [{ label: 'x'.repeat(250) }, error('labelLength', { length: 250 })],
    [{ mode: 'expand-label', label: '' }, error('labelEmpty')],
  ])('rejects %j', (overrides, expected) => {
    expect(validateHkdfParams({ ...BASE, ...overrides })).toEqual(expected);
  });

  it('rejects non-objects', () => {
    expect(validateHkdfParams(null)).toEqual(error('invalidParams'));
    expect(validateHkdfParams('x')).toEqual(error('invalidParams'));
  });
});

describe('hkdf manifest', () => {
  it('declares a Mac member field limited to HMAC, defaulting to HMAC-SHA-256', () => {
    const mac = HKDF_PARAM_FIELDS.find((field) => field.name === 'mac');
    expect(mac).toMatchObject({ kind: 'port', port: 'Mac', member: true, constructions: ['hmac'] });
    expect(JSON.stringify(mac)).toBe(JSON.stringify(hmacMemberField('plugin.hkdf', 'mac')));
    expect(BASE.mac).toBe('sha256:hmac-sha-256');
  });

  it('measures info in hex bytes while infoEncoding is hex', () => {
    expect(HKDF_PARAM_FIELDS.find((field) => field.name === 'info')).toMatchObject({
      kind: 'text',
      maxLength: 128,
      encodingParam: 'infoEncoding',
    });
    expect(HKDF_PARAM_FIELDS.find((field) => field.name === 'label')).toMatchObject({
      kind: 'text',
      maxLength: 249,
    });
  });

  it('offers the presets of docs/M7.md §2d, rfc5869-a1 first', () => {
    expect(hkdfManifest.presets.map((preset) => preset.id)).toEqual([
      'rfc5869-a1',
      'rfc5869-a2',
      'rfc5869-a3',
      'rfc5869-a4',
      'rfc5869-a7',
      'tls13-derived',
      'tls13-c-hs-traffic',
    ]);
  });

  it('labels the outputs prk and okm and the four ops', () => {
    expect(Object.keys(hkdfManifest.outputs ?? {})).toEqual(['prk', 'okm']);
    expect(Object.keys(hkdfManifest.ops ?? {})).toEqual([
      'hkdfLabel',
      'extract',
      'expand',
      'output',
    ]);
  });
});
