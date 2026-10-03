import { describe, expect, it } from 'vitest';
import { chainRows, edgePathData, layoutChain, neighbour, readingOrder, type LayoutMetrics } from './chainLayout.ts';
import { chainCase } from './testFixture.ts';

const metrics: LayoutMetrics = { nodeWidth: 100, hexLines: () => 0, hasLink: () => false };

describe('chainRows', () => {
  it('stacks CBC encryption stages and puts the IV beside the first ⊕', () => {
    const rows = chainRows(chainCase('cbc/repeated-blocks').facet);
    expect(['b0.input', 'b0.xor', 'b0.cipher', 'b0.output'].map((id) => rows.get(id))).toEqual([0, 1, 2, 3]);
    expect(rows.get('iv')).toBe(rows.get('b0.xor'));
    expect(rows.get('pad')).toBe(rows.get('b2.input'));
  });

  it('puts the CTR plaintext beside the keystream, right above ⊕', () => {
    const rows = chainRows(chainCase('ctr/short-message').facet);
    expect(['b0.counter', 'b0.cipher', 'b0.keystream', 'b0.xor', 'b0.output'].map((id) => rows.get(id))).toEqual([0, 1, 2, 3, 4]);
    expect(rows.get('b0.input')).toBe(2);
  });
});

describe('layoutChain', () => {
  it('sizes lanes for the widest cell and centres single nodes', () => {
    const layout = layoutChain(chainCase('ctr/short-message').facet, metrics);
    const box = (id: string) => layout.boxById.get(id)!;
    expect(box('b0.keystream').y).toBe(box('b0.input').y);
    expect(box('b0.input').x).toBeGreaterThan(box('b0.keystream').x);
    expect(box('b0.xor').x).toBe((box('b0.keystream').x + box('b0.input').x) / 2);
    expect(layout.lanes).toHaveLength(2);
    expect(layout.edges).toHaveLength(chainCase('ctr/short-message').facet.edges.length);
  });

  it('routes a same-row edge across non-adjacent lanes over the bus', () => {
    const layout = layoutChain(chainCase('ecb/repeated-blocks').facet, metrics);
    const pad = layout.edges.find((path) => path.key === 'pad->b2.input')!;
    expect(pad.d).toMatch(/^M[\d.]+ [\d.]+ V30 H[\d.]+ V[\d.]+$/);
    const down = layout.edges.find((path) => path.key === 'b0.input->b0.cipher')!;
    expect(down.d.startsWith('M')).toBe(true);
    expect(down.d).toContain(' C');
  });

  it('connects lanes side to side', () => {
    const layout = layoutChain(chainCase('cbc/repeated-blocks').facet, metrics);
    const source = layout.boxById.get('b0.output')!;
    const target = layout.boxById.get('b1.xor')!;
    expect(edgePathData(source, target).startsWith(`M${source.x + source.width} `)).toBe(true);
  });
});

describe('neighbour', () => {
  const layout = layoutChain(chainCase('cbc/repeated-blocks').facet, metrics);
  const at = (id: string) => layout.boxById.get(id)!;
  const move = (id: string, key: string) => neighbour(layout.boxes, at(id), key)?.node.id;

  it('moves within a lane with ↑/↓ and across lanes with ←/→', () => {
    expect(move('b0.input', 'ArrowDown')).toBe('b0.xor');
    expect(move('b0.xor', 'ArrowUp')).toBe('b0.input');
    expect(move('b0.output', 'ArrowDown')).toBeUndefined();
    expect(move('b0.xor', 'ArrowRight')).toBe('b1.xor');
    expect(move('b0.xor', 'ArrowLeft')).toBe('iv');
    expect(move('b1.cipher', 'Home')).toBe(readingOrder(layout.boxes)[0]?.node.id);
    expect(move('b0.input', 'End')).toBe('b2.output');
    expect(move('b0.input', 'Enter')).toBeUndefined();
  });
});
