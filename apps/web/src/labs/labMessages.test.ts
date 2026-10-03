import { describe, expect, it } from 'vitest';
import { extractParams } from '@cryventure/core';
import { producerRegistry, viewsForFacets } from './registry.ts';
import { labMessages } from './labMessages.ts';

const AES = producerRegistry.require('aes');

describe('labMessages', () => {
  const en = labMessages('en', AES);
  const de = labMessages('de-AT', AES);

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

  it("ships only the view catalogs of the views the producer's facets can feed", () => {
    const viewNamespaces = (messages: Record<string, string>) => new Set(Object.keys(messages).filter((key) => key.startsWith('view.')).map((key) => key.split('.')[1]));
    for (const producerId of ['xor', 'aes']) {
      const producer = producerRegistry.require(producerId);
      const offered = viewsForFacets(producer.facets).map((view) => view.id);
      expect([...viewNamespaces(labMessages('en', producer))].sort()).toEqual([...offered].sort());
    }
    expect(viewNamespaces(labMessages('en', producerRegistry.require('xor')))).not.toContain('key-schedule');
  });

  it('resolves the locale and keeps EN/DE key parity with matching params', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const [key, template] of Object.entries(en)) expect(extractParams(de[key] ?? '')).toEqual(extractParams(template));
    expect(de['ui.lab.params.title']).toBe('Eingaben');
    expect(de['plugin.aes.value.ciphertext']).toBe('Geheimtext');
    expect(de['core.error.hexOddLength']).toMatch(/gerade Anzahl/);
  });
});
