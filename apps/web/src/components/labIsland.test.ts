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

  it('ships no derived-view or deriver messages to a lab no deriver applies to (ctr)', () => {
    const { props } = labIsland({ labId: 'ctr', producerId: 'ctr' }, 'en');
    expect(hasPrefix(props.messages, 'view.state.')).toBe(true);
    for (const prefix of ['view.memory.', 'view.instructions.', 'view.registers.', 'deriver.'])
      expect(hasPrefix(props.messages, prefix), prefix).toBe(false);
  });

  it('ships them to the aes lab, whose op-detail runs the derivers apply to', () => {
    const { props } = labIsland({ labId: 'aes', producerId: 'aes' }, 'en');
    for (const prefix of ['view.memory.', 'view.instructions.', 'view.registers.', 'deriver.memory.', 'deriver.isa-x86.'])
      expect(hasPrefix(props.messages, prefix), prefix).toBe(true);
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

  it('resolves renamed view ids in the layout once, before pruning messages (layout-only key-schedule → derivation)', () => {
    const { props } = labIsland({ ...HERO, layout: 'state:60|key-schedule:40' }, 'en', { layoutViewsOnly: true });
    expect(props.layout).toBe('state:60|derivation:40');
    expect(hasPrefix(props.messages, 'view.derivation.')).toBe(true);
    expect(hasPrefix(props.messages, 'view.narration.')).toBe(false);
    expect(labIsland({ ...HERO, layout: undefined }, 'en').props.layout).toBeUndefined();
  });

  it('fails the build on invalid options, naming the wrapper', () => {
    expect(() => labIsland({ labId: 'x', producerId: 'nope' }, 'en')).toThrow('<Lab labId="x">: unknown producer "nope"');
    expect(() => labIsland({ ...HERO, presetId: 'nope' }, 'en', { tag: 'HeroLab' })).toThrow('<HeroLab labId="hero">: unknown preset "nope"');
    expect(() => labIsland({ ...HERO, startAt: 'bogus' }, 'en')).toThrow('invalid startAt');
    expect(() => labIsland({ ...HERO, variant: 'X Y' }, 'en')).toThrow('invalid variant');
    expect(() => labIsland({ ...HERO, mode: 'auto' }, 'en')).toThrow('unknown mode "auto"');
  });
});
