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
  private readonly availableAtByIndex = new Map<number, number>();
  private length = 0;

  /** Appends `segment` and returns the global offsets of its bytes. */
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

  /** Highlights `offsets` from `step` on and marks their segments as sent from `step` (the earliest emit wins). */
  emit(step: number, offsets: readonly number[]): void {
    this.activate(step, offsets);
    for (const offset of offsets) {
      const index = this.segmentIndexAt(offset);
      this.availableAtByIndex.set(index, Math.min(step, this.availableAtByIndex.get(index) ?? step));
    }
  }

  private segmentIndexAt(offset: number): number {
    let start = 0;
    const index = this.segments.findIndex((segment) => (start += segment.bytes.length) > offset);
    if (index < 0 || offset < 0) throw new RangeError(`WireBuilder.emit: offset ${offset} outside the segments`);
    return index;
  }

  private sentSegments(): WireSegment[] {
    return this.segments.map((segment, index) => {
      const availableAt = this.availableAtByIndex.get(index);
      return availableAt === undefined ? segment : { ...segment, availableAt };
    });
  }

  toFacet(): WireFacet {
    const facet: WireFacet = { kind: 'wire', schemaVersion: 1, segments: this.sentSegments() };
    if (this.offsetsByStep.size === 0) return facet;
    const activeAt = [...this.offsetsByStep.entries()].sort(([a], [b]) => a - b).map(([step, offsets]) => ({ step, offsets }));
    return { ...facet, activeAt };
  }
}
