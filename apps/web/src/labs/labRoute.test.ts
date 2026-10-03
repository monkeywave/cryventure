import { describe, expect, it } from 'vitest';
import { labMessages } from './labMessages.ts';
import { labRouteTexts } from './labRoute.ts';
import { producerRegistry } from './registry.ts';

describe('labRouteTexts', () => {
  it('translates the title of every registered producer in EN and DE', () => {
    for (const producer of producerRegistry.list()) {
      for (const lang of ['en', 'de']) {
        const { title } = labRouteTexts(producer, labMessages(lang, producer));
        expect(title, `${producer.id} (${lang})`).not.toBe(producer.titleKey);
        expect(title.length).toBeGreaterThan(0);
      }
    }
    expect(labRouteTexts(producerRegistry.require('aes'), labMessages('de', producerRegistry.require('aes'))).title).toMatch(/AES/);
  });

  it('uses the producer description when its catalog has one, and falls back to the id without a title', () => {
    const producer = { id: 'p', titleKey: 'plugin.p.title', i18nNamespace: 'plugin.p' };
    expect(labRouteTexts(producer, { 'plugin.p.title': 'P', 'plugin.p.description': 'About P' })).toEqual({ title: 'P', description: 'About P' });
    expect(labRouteTexts(producer, {})).toEqual({ title: 'p', description: undefined });
  });
});
