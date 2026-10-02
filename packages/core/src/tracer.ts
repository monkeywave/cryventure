import {
  applyWrites,
  regionSize,
  type Keyframe,
  type RegionSpec,
  type Snapshot,
  type StateFacet,
  type StateStep,
  type Write,
} from './facets/state.ts';

/** A step as emitted by a producer; the tracer fills in the scope path. Distributes over `Op` unions. */
export type StepInput<R extends string, Op extends { op: string }> = Op extends unknown
  ? Omit<StateStep<R, Op>, 'scope'>
  : never;

export interface Tracer<R extends string, Op extends { op: string }> {
  readonly enabled: boolean;
  step(event: StepInput<R, Op>): void;
  /** Opens a child scope; defaults to the next sibling index at the current level. */
  enter(scopeIndex?: number): void;
  leave(): void;
}

/** Zero-cost tracer: producers check `enabled` and skip building events. */
export class NullTracer<R extends string, Op extends { op: string }> implements Tracer<R, Op> {
  readonly enabled = false;
  step(_event: StepInput<R, Op>): void {}
  enter(_scopeIndex?: number): void {}
  leave(): void {}
}

/** Maintains a hierarchical scope path such as `[block, round, op]`. */
export class ScopeStack {
  private readonly indices: number[] = [];
  private readonly nextChild: number[] = [0];

  enter(scopeIndex?: number): void {
    const level = this.indices.length;
    const index = scopeIndex ?? this.nextChild[level] ?? 0;
    this.nextChild[level] = index + 1;
    this.indices.push(index);
    this.nextChild[level + 1] = 0;
  }

  leave(): void {
    if (this.indices.length === 0) throw new Error('Tracer.leave(): no open scope');
    this.indices.pop();
  }

  current(): number[] {
    return [...this.indices];
  }
}

export interface RecordingTracerOptions {
  /** A keyframe is stored after every K-th step (default 32). */
  keyframeInterval?: number;
  /** Stop recording after this many steps and mark the facet `truncated`. */
  maxSteps?: number;
}

export const DEFAULT_KEYFRAME_INTERVAL = 32;

function assertInitialMatchesRegions<R extends string>(regions: RegionSpec<R>[], initial: Snapshot<R>): void {
  for (const region of regions) {
    const values: readonly number[] | undefined = initial[region.id];
    if (values?.length !== regionSize(region)) {
      throw new RangeError(`RecordingTracer: initial "${region.id}" must have ${regionSize(region)} elements`);
    }
  }
}

function copyWrites<R extends string>(writes: readonly Write<R>[]): Write<R>[] {
  return writes.map((write) => ({ region: write.region, offset: write.offset, values: [...write.values] }));
}

/** Records steps into a `StateFacet` with periodic keyframes (state AFTER the keyframe step). */
export class RecordingTracer<R extends string, Op extends { op: string }> implements Tracer<R, Op> {
  readonly enabled = true;
  private readonly scopes = new ScopeStack();
  private readonly steps: StateStep<R, Op>[] = [];
  private readonly keyframes: Keyframe<R>[] = [];
  private readonly keyframeInterval: number;
  private readonly maxSteps: number;
  private current: Snapshot<R>;
  private truncated = false;

  constructor(
    private readonly regions: RegionSpec<R>[],
    private readonly initial: Snapshot<R>,
    options: RecordingTracerOptions = {},
  ) {
    assertInitialMatchesRegions(regions, initial);
    this.keyframeInterval = options.keyframeInterval ?? DEFAULT_KEYFRAME_INTERVAL;
    if (!Number.isInteger(this.keyframeInterval) || this.keyframeInterval < 1) {
      throw new RangeError('RecordingTracer: keyframeInterval must be a positive integer');
    }
    this.maxSteps = options.maxSteps ?? Number.POSITIVE_INFINITY;
    this.current = initial;
  }

  step(event: StepInput<R, Op>): void {
    if (this.steps.length >= this.maxSteps) {
      this.truncated = true;
      return;
    }
    const writes = copyWrites(event.writes);
    this.current = applyWrites(this.current, writes);
    this.steps.push({ ...event, writes, scope: this.scopes.current() } as StateStep<R, Op>);
    this.recordKeyframeIfDue();
  }

  enter(scopeIndex?: number): void {
    this.scopes.enter(scopeIndex);
  }

  leave(): void {
    this.scopes.leave();
  }

  toFacet(): StateFacet<R, Op> {
    const facet: StateFacet<R, Op> = {
      kind: 'state',
      schemaVersion: 1,
      regions: [...this.regions],
      initial: this.initial,
      steps: [...this.steps],
      keyframes: [...this.keyframes],
    };
    return this.truncated ? { ...facet, truncated: true } : facet;
  }

  private recordKeyframeIfDue(): void {
    if (this.steps.length % this.keyframeInterval !== 0) return;
    this.keyframes.push({ step: this.steps.length - 1, snapshot: this.current });
  }
}
