import { describe, expect, it } from 'vitest';
import { labIsland } from './labIsland.ts';

const HERO = { labId: 'hero', producerId: 'aes', presetId: 'fips197-c1', layout: 'state:65|narration:35', mode: 'story' };
const hasPrefix = (messages: Record<string, string>, prefix: string) => Object.keys(messages).some((key) => key.startsWith(prefix));

describe('labIsland', () => {
  it('builds the island props with every offered view\'s messages by default', () => {
    const { producer, props } = labIsland(HERO, 'en');
    expect(producer.id).toBe('aes');
    expect(props).toMatchObject({ labId: 'hero', producerId: 'aes', presetId: 'fips197-c1', mode: 'story', locale: 'en' });
    expect(hasPrefix(props.messages, 'view.state.')).toBe(true);
    expect(hasPrefix(props.messages, 'view.memory.')).toBe(true);
    expect(hasPrefix(props.messages, 'deriver.memory.')).toBe(true);
  });

  it('keeps only the layout views\' messages (and adds extra ones) for layoutViewsOnly', () => {
    const all = labIsland(HERO, 'en').props.messages;
    const { props } = labIsland(HERO, 'en', { layoutViewsOnly: true, extraMessages: { 'ui.hero.heading': 'Hi' } });
    expect(hasPrefix(props.messages, 'view.state.')).toBe(true);
    expect(hasPrefix(props.messages, 'view.narration.')).toBe(true);
    expect(hasPrefix(props.messages, 'view.memory.')).toBe(false);
    expect(hasPrefix(props.messages, 'deriver.')).toBe(false);
    expect(props.messages['ui.hero.heading']).toBe('Hi');
    expect(props.messages['ui.lab.posterPreset']).toBe(all['ui.lab.posterPreset']);
    expect(JSON.stringify(props.messages).length).toBeLessThan(JSON.stringify(all).length);
  });

  it('fails the build on invalid options, naming the wrapper', () => {
    expect(() => labIsland({ labId: 'x', producerId: 'nope' }, 'en')).toThrow('<Lab labId="x">: unknown producer "nope"');
    expect(() => labIsland({ ...HERO, presetId: 'nope' }, 'en', { tag: 'HeroLab' })).toThrow('<HeroLab labId="hero">: unknown preset "nope"');
    expect(() => labIsland({ ...HERO, startAt: 'bogus' }, 'en')).toThrow('invalid startAt');
    expect(() => labIsland({ ...HERO, variant: 'X Y' }, 'en')).toThrow('invalid variant');
    expect(() => labIsland({ ...HERO, mode: 'auto' }, 'en')).toThrow('unknown mode "auto"');
  });
});
