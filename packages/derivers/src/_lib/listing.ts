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

/** A memory operand: base register and byte offset. */
export interface MemOperand {
  base: string;
  offset: number;
}

const INTEL_MEM = /\[\s*(\w+)\s*(?:([+-])\s*(\d+)\s*)?\]/;
const ARM_MEM = /\[\s*(\w+)\s*(?:,\s*#(-?\d+)\s*)?\]/;

/** Parses `[rdx]`, `xmmword ptr [rdx + 16]`, `[x2]` or `[x2, #32]`; `undefined` for a non-memory operand. */
export function parseMemOperand(operand: string): MemOperand | undefined {
  const intel = INTEL_MEM.exec(operand);
  if (intel?.[1] !== undefined) {
    const magnitude = Number(intel[3] ?? 0);
    return { base: intel[1], offset: intel[2] === '-' ? -magnitude : magnitude };
  }
  const arm = ARM_MEM.exec(operand);
  return arm?.[1] === undefined ? undefined : { base: arm[1], offset: Number(arm[2] ?? 0) };
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
export function listingSource(listing: Listing): {
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
