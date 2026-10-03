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
  return match?.[1] === undefined ? undefined : { base: match[1], offset: signedOffset(match[2], match[3]) };
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
