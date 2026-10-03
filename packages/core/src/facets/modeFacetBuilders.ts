import type { ChainEdge, ChainFacet, ChainNode } from './chain.ts';
import type { WireFacet, WireSegment } from './wire.ts';

/** Builders for the block-mode facets `chain` and `wire` (docs/M3.md §6). */

/** Collects chain nodes and edges; an edge becomes active when its target node gets its value. */
export class ChainBuilder {
  private readonly nodes: ChainNode[] = [];
  private readonly edges: ChainEdge[] = [];
  private readonly activeAtById = new Map<string, number>();

  /** Adds `node` and returns its id. */
  node(node: ChainNode): string {
    this.nodes.push(node);
    this.activeAtById.set(node.id, node.activeAt);
    return node.id;
  }

  /**
   * Delays an already added node (with no incoming edges yet) to get its value at `activeAt`, e.g. the
   * last input block, complete only after the PKCS#7 pad step; throws a RangeError for an unknown `id`.
   */
  delay(id: string, activeAt: number): void {
    const index = this.nodes.findIndex((node) => node.id === id);
    const node = this.nodes[index];
    if (node === undefined) throw new RangeError(`ChainBuilder.delay: unknown node "${id}"`);
    this.nodes[index] = { ...node, activeAt };
    this.activeAtById.set(id, activeAt);
  }

  /** Edges from each of `from` into the already added node `to`; throws a RangeError for an unknown `to`. */
  link(from: string | readonly string[], to: string): void {
    const activeAt = this.activeAtById.get(to);
    if (activeAt === undefined) throw new RangeError(`ChainBuilder.link: unknown target "${to}"`);
    for (const source of typeof from === 'string' ? [from] : from) this.edges.push({ from: source, to, activeAt });
  }

  toFacet(meta: Pick<ChainFacet, 'mode' | 'direction' | 'formula'>): ChainFacet {
    return { kind: 'chain', schemaVersion: 1, ...meta, nodes: [...this.nodes], edges: [...this.edges] };
  }
}

/** Collects wire segments and per-step highlights over their concatenated bytes. */
export class WireBuilder {
  private readonly segments: WireSegment[] = [];
  private readonly offsetsByStep = new Map<number, number[]>();
  private length = 0;

  /** Appends `segment` (with its `availableAt`, if it is sent during the run) and returns the global offsets of its bytes. */
  segment(segment: WireSegment): number[] {
    this.segments.push(segment);
    const offsets = segment.bytes.map((_, index) => this.length + index);
    this.length += segment.bytes.length;
    return offsets;
  }

  /** Highlights `offsets` from `step` on (until the next activated step); repeated steps merge. */
  activate(step: number, offsets: readonly number[]): void {
    this.offsetsByStep.set(step, [...(this.offsetsByStep.get(step) ?? []), ...offsets]);
  }

  toFacet(): WireFacet {
    const facet: WireFacet = { kind: 'wire', schemaVersion: 1, segments: [...this.segments] };
    if (this.offsetsByStep.size === 0) return facet;
    const activeAt = [...this.offsetsByStep.entries()].sort(([a], [b]) => a - b).map(([step, offsets]) => ({ step, offsets }));
    return { ...facet, activeAt };
  }
}
