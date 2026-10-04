/**
 * The ρ offsets from first principles (FIPS 202 §3.2.2, Algorithm 2): starting at (x, y) = (1, 0),
 * step t = 0 … 23 gives lane (x, y) the offset (t + 1)(t + 2)/2 mod 64, then moves
 * (x, y) ← (y, (2x + 3y) mod 5), i.e. multiplies (x, y)ᵀ by the matrix [[0, 1], [2, 3]] mod 5.
 */

const WIDTH = 5;
const LANE_BITS = 64;
/** The walk has 24 steps: one per lane except (0, 0). */
export const RHO_STEPS = WIDTH * WIDTH - 1;
export const RHO_START = { x: 1, y: 0 } as const;

export interface Position {
  x: number;
  y: number;
}

/** One step of the walk. */
export interface RhoStep {
  t: number;
  position: Position;
  /** The triangular number (t + 1)(t + 2)/2 before reduction. */
  triangular: number;
  /** triangular mod 64: the rotation of lane (x, y). */
  offset: number;
  /** Where the walk goes next. */
  next: Position;
}

/** (x, y) ← (y, (2x + 3y) mod 5). */
export function nextPosition({ x, y }: Position): Position {
  return { x: y, y: (2 * x + 3 * y) % WIDTH };
}

/** (t + 1)(t + 2)/2, the (t + 1)-th triangular number. */
export const triangular = (t: number): number => ((t + 1) * (t + 2)) / 2;

/** The cell (lane) index x + 5y, row-major in a [5, 5] grid. */
export const cellIndex = ({ x, y }: Position): number => x + WIDTH * y;

/** All 24 steps of Algorithm 2. */
export function rhoWalk(): RhoStep[] {
  const steps: RhoStep[] = [];
  let position: Position = RHO_START;
  for (let t = 0; t < RHO_STEPS; t++) {
    const next = nextPosition(position);
    steps.push({ t, position, triangular: triangular(t), offset: triangular(t) % LANE_BITS, next });
    position = next;
  }
  return steps;
}

/** The 25 offsets by lane index x + 5y; lane (0, 0), which the walk never visits, stays 0 (Algorithm 2 step 1). */
export function offsetsTable(steps: readonly RhoStep[]): number[] {
  const table = new Array<number>(WIDTH * WIDTH).fill(0);
  steps.forEach((step) => (table[cellIndex(step.position)] = step.offset));
  return table;
}

/** How many different values `values` holds. */
export const distinctCount = (values: readonly number[]): number => new Set(values).size;
