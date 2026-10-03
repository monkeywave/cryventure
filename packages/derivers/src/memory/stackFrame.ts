import { formatHexAddress, parseHexAddress } from '@cryventure/core';

/**
 * Deterministic, modeled stack addresses (docs/M4.md §4): locals are placed below `frameBase` in
 * declaration order, each start rounded down to `frameAlign`. Real compilers may reorder locals and
 * ASLR moves the frame; the addresses are illustrative and labelled "modeled".
 */

export interface StackSlot {
  id: string;
  size: number;
}

export interface StackConventions {
  frameBase: string;
  growsDown: boolean;
  frameAlign: number;
}

/** Start address (lowercase hex) of every slot, keyed by slot id. */
export function modeledStackFrame(conventions: StackConventions, slots: readonly StackSlot[]): Map<string, string> {
  if (!conventions.growsDown) throw new Error('memory: only downward-growing stacks are modeled');
  const align = BigInt(conventions.frameAlign);
  let cursor = parseHexAddress(conventions.frameBase);
  const addresses = new Map<string, string>();
  for (const { id, size } of slots) {
    const unaligned = cursor - BigInt(size);
    cursor = unaligned - (((unaligned % align) + align) % align);
    addresses.set(id, formatHexAddress(cursor));
  }
  return addresses;
}
