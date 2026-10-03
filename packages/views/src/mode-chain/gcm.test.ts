import { describe, expect, it } from 'vitest';
import { centredScrollLeft, chainRows, edgePathData, fittedHeight, GEOMETRY, gutterX, hasDeepLane, laneSpanOf, laneStartScrollLeft, layoutChain, type LayoutMetrics, type NodeBox } from './chainLayout.ts';
import { ROLE_GLYPHS } from '../_lib/roleGlyphs.ts';
import { gcmRolesOf, hashLanes, isGcmRole, nodeRole } from './chainModel.ts';
import { gcmChainCase } from './gcmFixture.ts';
import { modeCase } from '../testing/modeFixture.ts';

const metrics: LayoutMetrics = { nodeWidth: 112, hexLines: () => 1, hasLink: (node) => node.zoom !== undefined };
const { chain } = gcmChainCase('gcm/mcgrew-viega-tc4');
const nodeOf = (id: string) => chain.nodes.find((node) => node.id === id)!;

describe('GCM node roles', () => {
  it('gives tag, AAD, the GHASH accumulator and the length block their own roles', () => {
    expect(nodeRole(nodeOf('tag.t'), 'encrypt')).toBe('tag');
    expect(nodeRole(nodeOf('ghash.aad0'), 'encrypt')).toBe('aad');
    expect(nodeRole(nodeOf('ghash.x1'), 'encrypt')).toBe('hash');
    expect(nodeRole(nodeOf('ghash.length'), 'encrypt')).toBe('length');
    expect(nodeRole(nodeOf('tag.mask'), 'encrypt')).toBe('key');
  });

  it('pairs each GCM role with a glyph (⊗ for the GF multiply)', () => {
    expect([ROLE_GLYPHS.tag, ROLE_GLYPHS.aad, ROLE_GLYPHS.hash, ROLE_GLYPHS.length]).toEqual(['✓', '◇✓', '⊗', '‖']);
    expect(isGcmRole('hash')).toBe(true);
    expect(isGcmRole('plaintext')).toBe(false);
  });

  it('lists the GCM roles a facet uses, none for the classic modes', () => {
    expect(gcmRolesOf(chain)).toEqual(['aad', 'hash', 'length', 'tag']);
    expect(gcmRolesOf(modeCase('ctr/short-message').chain)).toEqual([]);
  });

  it('finds the GHASH lane by its accumulator nodes', () => {
    expect([...hashLanes(chain)]).toEqual([4]);
    expect(hashLanes(modeCase('cbc/repeated-blocks').chain).size).toBe(0);
  });
});

describe('GCM layout', () => {
  const layout = layoutChain(chain, metrics);
  const box = (id: string) => layout.boxById.get(id)!;
  const overlaps = (a: NodeBox, b: NodeBox) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  it('puts the CTR lanes first and the GHASH lane (with the tag) last', () => {
    expect(layout.lanes.map(({ lane }) => lane)).toEqual([-1, 0, 1, 2, 3, 4]);
    expect(box('ghash.x1').column).toBe(5);
    expect(box('tag.t').column).toBe(5);
  });

  it('never overlaps two nodes', () => {
    for (const [i, a] of layout.boxes.entries()) for (const b of layout.boxes.slice(i + 1)) expect(overlaps(a, b), `${a.node.id} / ${b.node.id}`).toBe(false);
  });

  it('stacks the GHASH chain top → bottom and each source right above its multiply', () => {
    const tops = ['ghash.x1', 'ghash.x2', 'ghash.x3', 'ghash.x7', 'tag.t'].map((id) => box(id).y);
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    const rows = chainRows(chain);
    expect(rows.get('ghash.aad0')).toBe((rows.get('ghash.x1') ?? 0) - 1);
    expect(rows.get('ghash.length')).toBe((rows.get('ghash.x7') ?? 0) - 1);
  });

  it('puts the IV beside J0 so their edge does not run upwards', () => {
    const rows = chainRows(chain);
    expect(rows.get('iv')).toBe(rows.get('j0'));
    expect(box('iv').x).toBeLessThan(box('j0').x);
  });

  it('routes C and H into the GHASH lane through the gaps, not across nodes', () => {
    const path = layout.edges.find((edge) => edge.key === 'b0.output->ghash.x3')!;
    expect(path.d).toMatch(/^M[\d.]+ [\d.]+ V[\d.]+ H[\d.]+ V[\d.]+ H[\d.]+ V[\d.]+$/);
    const h = layout.edges.find((edge) => edge.key === 'h->ghash.x2')!;
    const gutters = (d: string) => Number(/ H([\d.]+) /.exec(d)?.[1]);
    expect(gutters(h.d)).toBeLessThan(gutters(path.d));
    expect(gutters(path.d)).toBeLessThan(box('ghash.x3').x);
  });

  it('fits a 390px panel only by scrolling inside it', () => {
    expect(layout.width).toBeGreaterThan(390);
    expect(centredScrollLeft({ left: box('tag.t').x, right: box('tag.t').x + 112 }, 390, layout.width)).toBe(layout.width - 390);
  });
});

describe('gutterX / edgePathData', () => {
  const at = (column: number, lane: number, row: number): NodeBox => ({ node: nodeOf('ghash.x1'), lane, column, row, x: column * 200, y: 42 + row * 80, width: 100, height: 46 });

  it('runs down the lane gap on the side facing the source, setup edges further out', () => {
    const lane = { x: 800, width: 100 };
    expect(gutterX(at(1, 0, 3), at(4, 3, 5), lane)).toBe(800 - GEOMETRY.laneGap / 2 + 8);
    expect(gutterX(at(0, -1, 1), at(4, 3, 5), lane)).toBe(800 - GEOMETRY.laneGap / 2 - 8);
    expect(gutterX(at(5, 4, 3), at(1, 0, 5), lane)).toBe(900 + GEOMETRY.laneGap / 2 - 8);
  });

  it('keeps the bus for first-row edges and side-to-side curves for adjacent lanes', () => {
    expect(edgePathData(at(0, -1, 0), at(3, 2, 0), 500)).toContain(`V${GEOMETRY.busY}`);
    expect(edgePathData(at(1, 0, 2), at(2, 1, 4), 500)).toContain(' C');
    expect(edgePathData(at(1, 0, 2), at(3, 2, 2), 500)).toContain(' H500 ');
    expect(edgePathData(at(1, 0, 2), at(3, 2, 2))).toContain(`V${GEOMETRY.busY}`);
  });
});

describe('GCM lane scrolling and fitted height', () => {
  const layout = layoutChain(chain, { nodeWidth: 152, hexLines: () => 2, hasLink: (node) => node.zoom !== undefined });
  const box = (id: string) => layout.boxById.get(id)!;
  const lane = (column: number) => layout.lanes[column]!;

  it('scrolls to the start of the current lane, half a lane gap before it, so no node on the left is cut', () => {
    const span = laneSpanOf(layout, [box('b1.cipher')])!;
    expect(span.left).toBe(lane(2).x - GEOMETRY.laneGap / 2);
    expect(span.right).toBe(lane(2).x + lane(2).width + GEOMETRY.laneGap / 2);
    const target = laneStartScrollLeft(span, 480, layout.width);
    expect(target).toBe(span.left);
    for (const other of layout.boxes) expect(other.x >= target || other.x + other.width <= target, other.node.id).toBe(true);
  });

  it('clamps the lane start to the scroll range', () => {
    expect(laneStartScrollLeft(laneSpanOf(layout, [box('iv')])!, 480, layout.width)).toBe(0);
    expect(laneStartScrollLeft(laneSpanOf(layout, [box('tag.t')])!, 480, layout.width)).toBe(layout.width - 480);
    expect(laneSpanOf(layout, [])).toBeUndefined();
  });

  it('fits the height to the lanes in view: no empty band under the CTR lanes, the whole GHASH chain when it shows', () => {
    const ctrBottom = box('b1.output').y + box('b1.output').height + GEOMETRY.bottom;
    expect(fittedHeight(layout, { left: lane(2).x, right: lane(2).x + 480 })).toBe(ctrBottom);
    expect(ctrBottom).toBeLessThan(layout.height - 300);
    expect(fittedHeight(layout, { left: lane(5).x - 100, right: lane(5).x + 380 })).toBe(layout.height);
    expect(fittedHeight(layout, { left: -500, right: -10 })).toBe(layout.height);
  });
});

describe('hasDeepLane', () => {
  const metrics: LayoutMetrics = { nodeWidth: 100, hexLines: () => 2, hasLink: () => false };

  it('finds the GHASH lane of GCM far deeper than the block lanes', () => {
    expect(hasDeepLane(layoutChain(gcmChainCase('gcm/mcgrew-viega-tc4').chain, metrics))).toBe(true);
    expect(hasDeepLane(layoutChain(gcmChainCase('gcm/decrypt-forged').chain, metrics))).toBe(true);
  });

  it('keeps ECB, CBC and CTR (lanes of about equal depth) unfitted', () => {
    for (const id of ['ecb/repeated-blocks', 'ecb/repeated-blocks-decrypt', 'cbc/repeated-blocks', 'ctr/short-message'] as const)
      expect(hasDeepLane(layoutChain(modeCase(id).chain, metrics)), id).toBe(false);
  });
});
