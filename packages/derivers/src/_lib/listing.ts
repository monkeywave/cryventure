/**
 * Precomputed assembly listings (`isa-x86/data/aes<bits>.json`, `isa-armv8/data/…`, docs/M4.md §5): the shape the
 * generator writes, plus small parsers for their operands. Data only, no AES.
 */

export type ListingRole =
  | 'loadState'
  | 'loadKey'
  | 'ark0'
  | 'round'
  | 'lastRound'
  | 'finalXor'
  | 'aesmc'
  | 'store'
  | 'other';

export interface ListingInstruction {
  address: string;
  mnemonic: string;
  operands: string[];
  role: ListingRole;
  round?: number;
  /** The round key a key load or key operand refers to (`ldp` loads `keyIndex` and `keyIndex + 1`). */
  keyIndex?: number;
}

export interface Listing {
  compiler: string;
  flags: string;
  triple: string;
  function: string;
  source: string;
  compilerExplorerUrl?: string;
  instructions: ListingInstruction[];
}

/**
 * Roles in the SHA-256 compression listings (`isa-x86-sha/data/sha256.json`, `isa-armv8-sha/…`,
 * docs/M5.md §5b): a separate set, not mixed into the AES `ListingRole`.
 */
export type ShaListingRole =
  | 'loadState'
  | 'packState'
  | 'loadBlock'
  | 'byteSwap'
  | 'addK'
  | 'rounds'
  | 'rounds2'
  | 'msg1'
  | 'msg2'
  | 'unpackState'
  | 'feedForward'
  | 'store'
  | 'other';

export interface ShaListingInstruction {
  address: string;
  mnemonic: string;
  operands: string[];
  role: ShaListingRole;
  /** Round instructions (`sha256rnds2`, `sha256h`, `sha256h2`): the first round t they run. */
  round?: number;
  /**
   * Schedule instructions (`sha256msg1`/`msg2`, `sha256su0`/`su1`): the first schedule word t of the
   * group W[t..t+3] they produce (msg1/su0: the group whose partial sum they compute).
   */
  w?: number;
}

/** A listing's header: compiler, flags, triple, function, source and Compiler Explorer link. */
export type ListingHeader = Omit<Listing, 'instructions'>;

export interface ShaListing extends ListingHeader {
  instructions: ShaListingInstruction[];
}

/**
 * Roles in the Keccak-f[1600] listing (`isa-armv8-sha3/data/keccak.json`, docs/M6.md §5b): a
 * separate set again. `thetaParity` = `eor3` (C[x], `half` 1 = the inner `eor3` of three lanes,
 * 2 = the outer one finishing the column), `thetaD` = `rax1` (D[x]), `thetaRhoPi` = `xar` (θ, ρ
 * and π of one lane), `chi` = `bcax`, `iota` = the `eor` with RC, `loadRc` = the RC load, `loop` =
 * the round counter and the back branch. A `zip1` that pairs two lanes for a q-register `stp` is
 * `storeState` too. Callee-saved register saves, spills and reloads, register moves and the RC
 * table address are `other` (the listing stays honest).
 */
export type KeccakListingRole =
  | 'loadState'
  | 'loadRc'
  | 'thetaParity'
  | 'thetaD'
  | 'thetaRhoPi'
  | 'chi'
  | 'iota'
  | 'loop'
  | 'storeState'
  | 'other';

export interface KeccakListingInstruction {
  address: string;
  mnemonic: string;
  operands: string[];
  role: KeccakListingRole;
  /** `thetaParity` and `thetaD`: the column x of the C[x] or D[x] the instruction produces. */
  x?: number;
  /** `thetaParity`: 1 = C[x] partial over lanes (x,0)…(x,2), 2 = the full column parity. */
  half?: 1 | 2;
  /**
   * The lane index x + 5y (FIPS 202 A[x, y]) the instruction's result belongs to: `thetaRhoPi` the
   * destination lane after π, `chi` and `iota` the lane they produce, `loadState`/`storeState` the
   * first lane they move (an `ldp`/`stp` of d registers moves `lane` and `lane + 1`, of q registers
   * `lane` … `lane + 3`; a `zip1` packs `lane` and `lane + 1` into one q register).
   */
  lane?: number;
}

/**
 * A listing with one loop (additive to the M4/M5 shape, absent from the AES and SHA listings): the
 * instructions from address `first` through `last` (inclusive; `last` is the backward branch) form
 * the loop body, run `iterations` times in a row. Everything before `first` is the prologue, after
 * `last` the epilogue. For Keccak one body iteration is one round, so a deriver replays prologue,
 * then the body `iterations` (24) times, then the epilogue, once per permutation.
 */
export interface ListingLoop {
  first: string;
  last: string;
  iterations: number;
}

export interface KeccakListing extends ListingHeader {
  loop: ListingLoop;
  instructions: KeccakListingInstruction[];
}

/** A memory operand: base register and byte offset. */
export interface MemOperand {
  base: string;
  offset: number;
}

/** A decimal or `0x` hex magnitude, as compilers and disassemblers print offsets. */
const NUMBER = String.raw`0x[0-9a-f]+|\d+`;
const INTEL_MEM = new RegExp(String.raw`\[\s*(\w+)\s*(?:([+-])\s*(${NUMBER})\s*)?\]`, 'i');
const ARM_MEM = new RegExp(String.raw`\[\s*(\w+)\s*(?:,\s*#\s*(-?)(${NUMBER})\s*)?\]`, 'i');

function signedOffset(sign: string | undefined, magnitude: string | undefined): number {
  const value = Number(magnitude ?? 0);
  return sign === '-' ? -value : value;
}

/**
 * Parses `[rdx]`, `xmmword ptr [rdx + 16]`, `[x2]`, `[x2, #32]` or `[x2, #0x20]`; `undefined` for a
 * non-memory operand. The one memory-operand parser: the listing generator (`@cryventure/tools`) uses it too.
 */
export function parseMemOperand(operand: string): MemOperand | undefined {
  const match = INTEL_MEM.exec(operand) ?? ARM_MEM.exec(operand);
  return match?.[1] === undefined
    ? undefined
    : { base: match[1], offset: signedOffset(match[2], match[3]) };
}

/** `d8`, `q8`, `v8.16b` and `v8.2d` name the same 128-bit register `v8`. */
const ARM_SIMD = /^[dqv](\d+)(?:\.\w+)?$/;

/**
 * Canonical name `v<n>` of an AArch64 SIMD operand (`d`, `q` or `v` view), or `undefined`. The one
 * AArch64 register canonicaliser: the listing generator (`@cryventure/tools`) uses it too.
 */
export function armSimdRegister(operand: string): string | undefined {
  const match = ARM_SIMD.exec(operand);
  return match === null ? undefined : `v${match[1]}`;
}

/** An AArch64 immediate operand, `#8` or `# 8` → 8; throws for anything else. */
export function armImmediate(text: string): number {
  const match = /^#\s*(\d+)$/.exec(text.trim());
  if (match === null) throw new Error(`"${text}" is not an immediate`);
  return Number(match[1]);
}

/** The listing for Nr rounds; throws when the deriver ships none. */
export function listingForRounds(
  listings: Readonly<Record<number, Listing>>,
  rounds: number,
): Listing {
  const listing = listings[rounds];
  if (listing === undefined) throw new Error(`no listing for AES with ${rounds} rounds`);
  return listing;
}

/** The facet `source` block of a listing (the C source text stays in the listing). */
export function listingSource(listing: Omit<ListingHeader, 'source'>): {
  compiler: string;
  flags: string;
  triple: string;
  function: string;
  compilerExplorerUrl?: string;
} {
  const { compiler, flags, triple, compilerExplorerUrl } = listing;
  const source = { compiler, flags, triple, function: listing.function };
  return compilerExplorerUrl === undefined ? source : { ...source, compilerExplorerUrl };
}

/** The instruction's AES round; throws when the listing has none. */
export function requiredRound(instruction: ListingInstruction): number {
  if (instruction.round === undefined)
    throw new Error(`listing ${instruction.address} ${instruction.mnemonic}: no round`);
  return instruction.round;
}
