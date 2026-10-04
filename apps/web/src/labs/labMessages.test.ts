import { describe, expect, it } from 'vitest';
import { extractParams, portOptions, type ParamField, type PrimitiveManifest } from '@cryventure/core';
import { loadCoreMessages } from '@cryventure/core/messages';
import { producerRegistry, viewRegistry, viewsForProducer } from './registry.ts';
import { deriversApplicableToAny, sampleBundles } from './sampleDerivers.ts';
import { labMessages } from './labMessages.ts';

const AES = producerRegistry.require('aes');

describe('labMessages', () => {
  const en = labMessages('en', AES);
  const de = labMessages('de-AT', AES);

  it('contains exactly the namespaces a lab needs', () => {
    const namespaces = new Set(Object.keys(en).map((key) => key.split('.').slice(0, 2).join('.')));
    expect([...namespaces].every((ns) => /^(ui|view|deriver|core|plugin)\./.test(ns))).toBe(true);
    expect(en).toHaveProperty('ui.player.next');
    expect(en).toHaveProperty('view.narration.title');
    expect(en).toHaveProperty('ui.lab.params.title');
    expect(en).toHaveProperty('plugin.aes.step.subBytes');
    expect(en).toHaveProperty('plugin.aes.param.key');
    expect(en).toHaveProperty('core.error.hexOddLength');
    expect(en).not.toHaveProperty('ui.notFound.title');
    expect(Object.keys(en).some((key) => key.startsWith('plugin.') && !key.startsWith('plugin.aes.'))).toBe(false);
  });

  it('ships every core.error.* message, so any run error (e.g. a port that failed to load) renders without lab-specific wiring', () => {
    for (const lang of ['en', 'de'] as const) {
      const coreErrors = Object.keys(loadCoreMessages(lang)).filter((key) => key.startsWith('core.error.'));
      expect(coreErrors.length).toBeGreaterThan(0);
      expect(Object.keys(labMessages(lang, AES))).toEqual(expect.arrayContaining(coreErrors));
    }
  });

  it("ships only the view catalogs of the views a sample run of the producer can feed", async () => {
    const viewNamespaces = (messages: Record<string, string>) => new Set(Object.keys(messages).filter((key) => key.startsWith('view.')).map((key) => key.split('.')[1]));
    for (const producerId of ['xor', 'aes']) {
      const producer = producerRegistry.require(producerId);
      const derivers = deriversApplicableToAny(await sampleBundles(producer));
      const offered = viewsForProducer(producer, viewRegistry, derivers).map((view) => view.id);
      expect([...viewNamespaces(labMessages('en', producer))].sort()).toEqual([...offered].sort());
    }
    const xorViews = viewNamespaces(labMessages('en', producerRegistry.require('xor')));
    for (const hidden of ['key-schedule', 'memory', 'instructions', 'registers']) expect(xorViews).not.toContain(hidden);
    expect(viewNamespaces(labMessages('en', AES))).toContain('memory');
  });

  it('resolves the locale and keeps EN/DE key parity with matching params', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const [key, template] of Object.entries(en)) expect(extractParams(de[key] ?? '')).toEqual(extractParams(template));
    expect(de['ui.lab.params.title']).toBe('Eingaben');
    expect(de['plugin.aes.value.ciphertext']).toBe('Geheimtext');
    expect(de['core.error.hexOddLength']).toMatch(/gerade Anzahl/);
  });
});

describe('labMessages for a producer with a port param', () => {
  const composite = {
    id: 'xor',
    i18nNamespace: 'plugin.xor',
    facets: AES.facets,
    defaults: {},
    paramFields: [{ name: 'cipher', kind: 'port' as const, port: 'BlockCipher' as const, labelKey: 'plugin.xor.title' }],
  };

  it('also ships the namespace of every producer that can fill the port', () => {
    const implementers = producerRegistry.list().filter((producer) => producer.implements.includes('BlockCipher'));
    expect(implementers.length).toBeGreaterThan(0);
    const en = labMessages('en', composite);
    for (const producer of implementers) expect(en).toHaveProperty(producer.titleKey);
    expect(en).toHaveProperty('plugin.xor.title');
    const unrelated = producerRegistry.list().filter((producer) => !producer.implements.includes('BlockCipher') && producer.id !== 'xor');
    for (const producer of unrelated) expect(Object.keys(en).some((key) => key.startsWith(`${producer.i18nNamespace}.`))).toBe(false);
  });

  it('keeps EN/DE parity for the added namespaces', () => {
    expect(Object.keys(labMessages('de', composite)).sort()).toEqual(Object.keys(labMessages('en', composite)).sort());
  });
});

describe('labMessages for a producer with member port fields (docs/M7.md §1b)', () => {
  const hashField = { name: 'hash', kind: 'port', port: 'Hash', member: true, labelKey: 'plugin.xor.title' } as const satisfies ParamField;
  const macField = { name: 'mac', kind: 'port', port: 'Mac', member: true, constructions: ['hmac'], labelKey: 'plugin.xor.title' } as const satisfies ParamField;
  const composite = { id: 'xor', i18nNamespace: 'plugin.xor', facets: AES.facets, defaults: {}, paramFields: [hashField, macField] };

  /** Real producers re-declared with members whose labels live in their own namespaces. */
  const withMembers = (id: string, members: Record<string, string>) =>
    ({ ...producerRegistry.require(id), implements: ['Hash'], portMembers: { Hash: Object.entries(members).map(([memberId, labelKey]) => ({ id: memberId, labelKey })) } }) as PrimitiveManifest;
  const registered = [withMembers('sha256', { 'sha-224': 'plugin.sha256.param.algorithmOption.sha-224', 'sha-256': 'plugin.sha256.param.algorithmOption.sha-256' }), withMembers('sha1', { 'sha-1': 'plugin.sha1.title' }), AES];

  it("ships every member option's label from its producer's namespace, in EN and DE", () => {
    const options = portOptions(registered, hashField);
    expect(options.map((option) => option.value)).toEqual(['sha1:sha-1', 'sha256:sha-224', 'sha256:sha-256']);
    for (const lang of ['en', 'de']) {
      const messages = labMessages(lang, composite, registered);
      for (const option of options) expect(messages).toHaveProperty([option.labelKey]);
      expect(Object.keys(messages).some((key) => key.startsWith('plugin.aes.'))).toBe(false);
    }
  });

  it('labels every member option of the registered producers (once they declare members)', () => {
    const options = [hashField, macField].flatMap((field) => portOptions(producerRegistry.list(), field));
    for (const lang of ['en', 'de']) {
      const messages = labMessages(lang, composite);
      for (const option of options) expect(messages).toHaveProperty([option.labelKey]);
    }
  });
});
