// @vitest-environment jsdom
import '@cryventure/viz/testing/setup';
import { render } from '@testing-library/react';
import { I18nProvider } from '@cryventure/viz';
import { describe, expect, it } from 'vitest';
import en from '../../i18n/en/flyThrough.json' with { type: 'json' };
import { FlyDiagram, type FlyDiagramProps } from './FlyDiagram.tsx';
import { NARROW_GEOMETRY, WIDE_GEOMETRY } from './flyGeometry.ts';
import type { FlyView } from './useFlyThrough.ts';

const MATRIX: FlyView = { beat: 0, impl: 'c-ref', target: 'rd_key' };
const MEMORY: FlyView = { beat: 2, impl: 'c-ref', target: 'rd_key' };

function renderDiagram(props: Partial<FlyDiagramProps> = {}) {
  const { container } = render(
    <I18nProvider messages={en} locale="en">
      <FlyDiagram geometry={WIDE_GEOMETRY} view={MATRIX} previous={null} reducedMotion={false} describedBy="caption" {...props} />
    </I18nProvider>,
  );
  const svg = container.querySelector('svg')!;
  const layers = () => Array.from(svg.querySelectorAll<SVGGElement>('.cv-fly__tokens'));
  const byte = (index: number, layer = layers().at(-1)!) => layer.querySelector<SVGGElement>(`[data-byte="${index}"]`)!;
  return { svg, layers, byte };
}

describe('FlyDiagram', () => {
  it('is one labelled image described by the caption', () => {
    const { svg } = renderDiagram();
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe(en['ui.flyThrough.diagramLabel']);
    expect(svg.getAttribute('aria-describedby')).toBe('caption');
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${WIDE_GEOMETRY.width} ${WIDE_GEOMETRY.height}`);
    expect(svg.dataset['layout']).toBe('wide');
  });

  it('draws 48 slots (matrix, xmm0, RAM) and 16 byte tokens', () => {
    const { svg, layers } = renderDiagram();
    expect(svg.querySelectorAll('.cv-fly__slot')).toHaveLength(48);
    expect(layers()).toHaveLength(1);
    expect(layers()[0]!.querySelectorAll('.cv-fly__byte')).toHaveLength(16);
  });

  it('marks round-key bytes with the key glyph and role, the output block as state', () => {
    const key = renderDiagram();
    expect(key.layers()[0]!.dataset['role']).toBe('key');
    expect(key.svg.querySelector('.cv-fly__glyph')).not.toBeNull();
    expect(key.svg.textContent).toContain('rd_key[0]');

    const out = renderDiagram({ view: { beat: 0, impl: 'aesni', target: 'out' } });
    expect(out.layers()[0]!.dataset['role']).toBe('state');
    expect(out.svg.querySelector('.cv-fly__glyph')).toBeNull();
    expect(out.svg.textContent).toContain('out[0…3]');
    expect(out.byte(0).textContent).toBe('69');
  });

  it('places each byte on its slot for the beat', () => {
    const { byte } = renderDiagram({ view: MEMORY });
    const slot = WIDE_GEOMETRY.rowSlot('ram', 3);
    expect(byte(0).style.transform).toBe(`translate(${slot.x}px, ${slot.y}px)`);
  });

  it('cross-fades two layers under reduced motion and hides the old one', () => {
    const { layers } = renderDiagram({ view: MEMORY, previous: MATRIX, reducedMotion: true });
    expect(layers().map((layer) => layer.getAttribute('class'))).toEqual(['cv-fly__tokens cv-fly__tokens--out', 'cv-fly__tokens cv-fly__tokens--in']);
    expect(layers()[0]!.getAttribute('aria-hidden')).toBe('true');
    expect(layers()[1]!.hasAttribute('aria-hidden')).toBe(false);
  });

  it('uses the narrow layout when given', () => {
    const { svg } = renderDiagram({ geometry: NARROW_GEOMETRY });
    expect(svg.dataset['layout']).toBe('narrow');
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${NARROW_GEOMETRY.width} ${NARROW_GEOMETRY.height}`);
  });
});
