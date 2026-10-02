import { extractParams, paramFieldKeys, type I18nRef, type Messages } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { decryptBlock, encryptBlock } from './cipher.ts';
import de from './i18n/de.json';
import en from './i18n/en.json';
import { aesManifest, AES_PARAM_FIELDS, AES_PRESETS, validateAesParams } from './manifest.ts';
import { AES_OP_NAMES, AES_SCOPE_LEVELS, aesRegions, opLabelKey, opShortLabelKey } from './aesTrace.ts';
import { keyScheduleDerivation } from './derivation.ts';
import { hexBytes, recordingTracerFor } from './testHelpers.ts';

const LOCALES: Record<string, Messages> = { en, de };

function emittedRefs(detail: 'op' | 'round'): I18nRef[] {
  const key = hexBytes('000102030405060708090a0b0c0d0e0f');
  const block = hexBytes('00112233445566778899aabbccddeeff');
  return [encryptBlock, decryptBlock].flatMap((cipher) => {
    const tracer = recordingTracerFor(16);
    cipher(key, block, tracer, detail);
    return tracer.toFacet().steps.map((step) => step.narration);
  });
}

function declaredKeys(): string[] {
  return [
    aesManifest.titleKey,
    ...AES_PRESETS.map((preset) => preset.labelKey),
    ...paramFieldKeys(AES_PARAM_FIELDS),
    ...aesRegions(10).map((region) => region.labelKey),
    ...['key', 'plaintext', 'ciphertext', 'roundKey'].map((name) => `plugin.aes.value.${name}`),
    ...AES_OP_NAMES.map(opLabelKey),
    ...AES_OP_NAMES.map(opShortLabelKey),
    ...AES_SCOPE_LEVELS.map((level) => level.labelKey),
  ];
}

describe('i18n parity', () => {
  it('EN and DE have identical keys, all under plugin.aes.*', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en)) expect(key.startsWith('plugin.aes.')).toBe(true);
  });

  it('EN and DE use identical {{params}} per key', () => {
    for (const [key, template] of Object.entries(en)) {
      expect(extractParams(de[key as keyof typeof de]).sort(), key).toEqual(
        extractParams(template).sort(),
      );
    }
  });

  it('every DE message differs from its EN counterpart (except FIPS 197 transformation names)', () => {
    const isTransformationName = (key: string, template: string) => key.startsWith('plugin.aes.opShort.') && /^[A-Z][A-Za-z]+$/.test(template);
    for (const [key, template] of Object.entries(en)) {
      if (!isTransformationName(key, template)) expect(de[key as keyof typeof de], key).not.toBe(template);
    }
  });
});

describe('i18n coverage', () => {
  it('every declared label key exists in both locales', () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      for (const key of declaredKeys())
        expect(Object.hasOwn(messages, key), `${locale}:${key}`).toBe(true);
    }
  });

  it('every narration ref emitted in a full run exists in both locales with matching params', () => {
    const refs = [...emittedRefs('op'), ...emittedRefs('round')];
    for (const [locale, messages] of Object.entries(LOCALES)) {
      for (const ref of refs) {
        const template = messages[ref.key];
        expect(template, `${locale}:${ref.key}`).toBeDefined();
        expect(Object.keys(ref.params ?? {}).sort(), ref.key).toEqual(
          extractParams(template ?? '').sort(),
        );
      }
    }
  });

  it('scope level templates: round uses {{value}}, op uses {{ordinal}}', () => {
    for (const messages of Object.values(LOCALES)) {
      expect(AES_SCOPE_LEVELS.map((level) => extractParams(messages[level.labelKey] ?? ''))).toEqual([['value'], ['ordinal']]);
    }
  });

  it('every derivation label ref (AES-128 and AES-256) exists in both locales with matching params', () => {
    const labels = [16, 32].flatMap((length) => keyScheduleDerivation(new Array<number>(length).fill(0), length / 4 + 6, () => undefined).nodes.map((node) => node.label));
    for (const [locale, messages] of Object.entries(LOCALES)) {
      for (const ref of labels) expect(extractParams(messages[ref.key] ?? '').sort(), `${locale}:${ref.key}`).toEqual(Object.keys(ref.params ?? {}).sort());
    }
  });

  it('every plugin error key produced by validation exists in both locales', () => {
    const errors = [
      null,
      { keyHex: '00', plaintextHex: '00' },
      { keyHex: '00'.repeat(16), plaintextHex: '00' },
      { keyHex: '00'.repeat(16), plaintextHex: '00'.repeat(16), detail: 'x' },
    ]
      .map(validateAesParams)
      .flatMap((result) => (result.ok ? [] : [result.error]));
    expect(errors).toHaveLength(4);
    for (const messages of Object.values(LOCALES)) {
      for (const error of errors)
        expect(extractParams(messages[error.key] ?? '').sort()).toEqual(
          Object.keys(error.params ?? {}).sort(),
        );
    }
  });
});
