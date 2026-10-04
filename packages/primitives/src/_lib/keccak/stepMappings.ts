import { KECCAK_LANES, KECCAK_ROUNDS, KECCAK_WIDTH, laneIndex, PI_SOURCE, RHO_OFFSETS, ROUND_CONSTANTS } from './constants.ts';
import { not64, rotl64, type KeccakState } from './lanes.ts';

/**
 * The five step mappings of Keccak-p[1600, 24] (FIPS 202 §3.2), each a pure function of the lanes,
 * plus Rnd (§3.3) and Keccak-f[1600] (§3.4). θ also returns its column parities C, the D values and
 * `partial` (docs/M6.md §2b).
 */

/** θ's intermediate values, one per column x. */
export interface ThetaColumns {
  /** C[x] = A[x,0] ⊕ A[x,1] ⊕ A[x,2] ⊕ A[x,3] ⊕ A[x,4] (Algorithm 1 step 1). */
  c: bigint[];
  /** D[x] = C[(x−1) mod 5] ⊕ ROT(C[(x+1) mod 5], 1) (step 2). */
  d: bigint[];
  /** A[x,0] ⊕ A[x,1] ⊕ A[x,2]: what a three-input XOR (ARMv8.2 EOR3) holds after its first step. */
  partial: bigint[];
}

export interface ThetaResult extends ThetaColumns {
  state: KeccakState;
}

const columns = (): number[] => Array.from({ length: KECCAK_WIDTH }, (_, x) => x);

function columnXor(state: readonly bigint[], x: number, rows: number): bigint {
  let parity = 0n;
  for (let y = 0; y < rows; y++) parity ^= state[laneIndex(x, y)]!;
  return parity;
}

/** θ (Algorithm 1): A′[x, y] = A[x, y] ⊕ D[x]. */
export function theta(state: readonly bigint[]): ThetaResult {
  const c = columns().map((x) => columnXor(state, x, KECCAK_WIDTH));
  const partial = columns().map((x) => columnXor(state, x, 3));
  const d = columns().map((x) => c[(x + KECCAK_WIDTH - 1) % KECCAK_WIDTH]! ^ rotl64(c[(x + 1) % KECCAK_WIDTH]!, 1));
  return { state: state.map((lane, index) => lane ^ d[index % KECCAK_WIDTH]!), c, d, partial };
}

/** ρ (Algorithm 2): every lane rotated left by its offset. */
export function rho(state: readonly bigint[]): KeccakState {
  return state.map((lane, index) => rotl64(lane, RHO_OFFSETS[index]!));
}

/** π (Algorithm 3): A′[x, y] = A[(x + 3y) mod 5, x]. */
export function pi(state: readonly bigint[]): KeccakState {
  return PI_SOURCE.map((source) => state[source]!);
}

/** χ (Algorithm 4): A′[x, y] = A[x, y] ⊕ (¬A[x+1, y] ∧ A[x+2, y]), the only non-linear step. */
export function chi(state: readonly bigint[]): KeccakState {
  return state.map((lane, index) => {
    const x = index % KECCAK_WIDTH;
    const row = index - x;
    return lane ^ (not64(state[row + ((x + 1) % KECCAK_WIDTH)]!) & state[row + ((x + 2) % KECCAK_WIDTH)]!);
  });
}

/** ι (Algorithm 6): lane (0, 0) ⊕ RC[round]. */
export function iota(state: readonly bigint[], round: number): KeccakState {
  const rc = roundConstant(round);
  return state.map((lane, index) => (index === 0 ? lane ^ rc : lane));
}

/** RC[round], round in 0 … 23. */
export function roundConstant(round: number): bigint {
  const rc = ROUND_CONSTANTS[round];
  if (rc === undefined) throw new RangeError(`roundConstant: round ${round} outside 0..${KECCAK_ROUNDS - 1}`);
  return rc;
}

/** One round with every intermediate state (what the traced producer records). */
export interface RoundDetail {
  round: number;
  theta: ThetaResult;
  rho: KeccakState;
  pi: KeccakState;
  chi: KeccakState;
  iota: KeccakState;
  rc: bigint;
}

/** Rnd(A, i_r) = ι(χ(π(ρ(θ(A)))), i_r) (FIPS 202 §3.3), keeping every step. */
export function roundDetailed(state: readonly bigint[], round: number): RoundDetail {
  const afterTheta = theta(state);
  const afterRho = rho(afterTheta.state);
  const afterPi = pi(afterRho);
  const afterChi = chi(afterPi);
  return { round, theta: afterTheta, rho: afterRho, pi: afterPi, chi: afterChi, iota: iota(afterChi, round), rc: roundConstant(round) };
}

/** Rnd(A, i_r). */
export function keccakRound(state: readonly bigint[], round: number): KeccakState {
  return iota(chi(pi(rho(theta(state).state))), round);
}

/** Keccak-f[1600] = Keccak-p[1600, 24] (FIPS 202 §3.4): rounds 0 … 23. */
export function keccakF1600(state: readonly bigint[]): KeccakState {
  if (state.length !== KECCAK_LANES) throw new RangeError(`keccakF1600: ${state.length} lanes, expected ${KECCAK_LANES}`);
  let next = [...state];
  for (let round = 0; round < KECCAK_ROUNDS; round++) next = keccakRound(next, round);
  return next;
}
