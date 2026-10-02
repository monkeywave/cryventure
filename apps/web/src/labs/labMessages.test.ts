import { describe, expect, it } from 'vitest';
import { extractParams } from '@cryventure/core';
import { labMessages, pickPrefix } from './labMessages.ts';

describe('pickPrefix', () => {
  it('keeps only keys under the prefix', () => {
    expect(pickPrefix({ 'ui.lab.a': '1', 'ui.notFound.b': '2' }, 'ui.lab.')).toEqual({ 'ui.lab.a': '1' });
  });
});

describe('labMessages', () => {
  const en = labMessages('en', 'aes');
  const de = labMessages('de-AT', 'aes');

  it('contains exactly the namespaces a lab needs', () => {
    const namespaces = new Set(Object.keys(en).map((key) => key.split('.').slice(0, 2).join('.')));
    expect([...namespaces].every((ns) => /^(ui|view|core|plugin)\./.test(ns))).toBe(true);
    expect(en).toHaveProperty('ui.player.next');
    expect(en).toHaveProperty('view.narration.title');
    expect(en).toHaveProperty('ui.lab.params.title');
    expect(en).toHaveProperty('plugin.aes.step.subBytes');
    expect(en).toHaveProperty('plugin.aes.param.key');
    expect(en).toHaveProperty('core.error.hexOddLength');
    expect(en).not.toHaveProperty('ui.notFound.title');
    expect(Object.keys(en).some((key) => key.startsWith('plugin.') && !key.startsWith('plugin.aes.'))).toBe(false);
  });

  it('resolves the locale and keeps EN/DE key parity with matching params', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const [key, template] of Object.entries(en)) expect(extractParams(de[key] ?? '')).toEqual(extractParams(template));
    expect(de['ui.lab.params.title']).toBe('Eingaben');
    expect(de['plugin.aes.value.ciphertext']).toBe('Geheimtext');
    expect(de['core.error.hexOddLength']).toMatch(/gerade Anzahl/);
  });
});
