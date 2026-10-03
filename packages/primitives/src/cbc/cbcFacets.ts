import {
  addBlockSegment,
  addPadNode,
  addUnpadNode,
  blockSegmentId,
  ChainBuilder,
  chainLabel,
  cipherZoom,
  i18nRef,
  laneNodeId as nodeId,
  laneNodes,
  WireBuilder,
  type BlockCipher,
  type ChainFacet,
  type ModeDirection,
  type PaddedModeBlocks,
  type WireFacet,
} from '@cryventure/core';
import type { CbcBlockTrace } from './cbcTrace.ts';

/** The chain and wire facets of a CBC recording (docs/M3.md §6). */
const NS = 'plugin.cbc';

export interface CbcFacetContext {
  direction: ModeDirection;
  cipher: BlockCipher;
  key: Uint8Array;
  iv: number[];
}

const label = (name: string, n?: number) => chainLabel(NS, name, n);

/** Encryption: Pᵢ and Cᵢ₋₁ → ⊕ → E_K → Cᵢ, sent on the wire. Each E_K node zooms into the cipher's own lab. */
function encryptLane(chain: ChainBuilder, block: CbcBlockTrace, index: number, context: CbcFacetContext): void {
  const n = index + 1;
  const node = laneNodes(chain, index);
  const input = node('input', 'input', label('plaintext', n), block.input, -1);
  const xor = node('xor', 'xor', label('xor'), block.cipherIn, block.steps.xor, [input, index === 0 ? 'iv' : nodeId(index - 1, 'output')]);
  const cipher = node('cipher', 'cipher', label('encrypt'), block.cipherOut, block.steps.cipher, xor, cipherZoom(context.cipher, context.key, block.cipherIn));
  node('output', 'output', label('ciphertext', n), block.output, block.steps.emit, cipher, { segmentId: blockSegmentId(index) });
}

/** Decryption: Cᵢ → D_K → ⊕ Cᵢ₋₁ → Pᵢ. */
function decryptLane(chain: ChainBuilder, block: CbcBlockTrace, index: number): void {
  const n = index + 1;
  const node = laneNodes(chain, index);
  const input = node('input', 'input', label('ciphertext', n), block.input, -1);
  const cipher = node('cipher', 'cipher', label('decrypt'), block.cipherOut, block.steps.cipher, input);
  const xor = node('xor', 'xor', label('xor'), block.output, block.steps.xor, [cipher, index === 0 ? 'iv' : nodeId(index - 1, 'input')]);
  node('output', 'output', label('plaintext', n), block.output, block.steps.emit, xor);
}

export function cbcChain(recording: PaddedModeBlocks<CbcBlockTrace>, context: CbcFacetContext): ChainFacet {
  const chain = new ChainBuilder();
  chain.node({ id: 'iv', block: -1, kind: 'iv', label: label('iv'), bytes: context.iv, valueRef: 'iv', activeAt: -1 });
  if (context.direction === 'encrypt') {
    recording.blocks.forEach((block, index) => encryptLane(chain, block, index, context));
    addPadNode(chain, NS, recording);
  } else {
    recording.blocks.forEach((block, index) => decryptLane(chain, block, index));
    addUnpadNode(chain, NS, recording);
  }
  return chain.toFacet({ mode: 'cbc', direction: context.direction, formula: i18nRef(`${NS}.formula.${context.direction}`) });
}

/**
 * What travels: the IV, then the ciphertext blocks. Encrypting lights each block when it is emitted;
 * decrypting lights the block being deciphered, then the one it is XORed with.
 */
export function cbcWire(recording: PaddedModeBlocks<CbcBlockTrace>, context: Pick<CbcFacetContext, 'direction' | 'iv'>): WireFacet {
  const wire = new WireBuilder();
  const ivOffsets = wire.segment({ id: 'iv', role: 'iv', label: i18nRef(`${NS}.wire.iv`), bytes: context.iv, valueRef: 'iv' });
  if (context.direction === 'encrypt') {
    wire.activate(-1, ivOffsets);
    recording.blocks.forEach((block, index) => wire.activate(block.steps.emit, addBlockSegment(wire, NS, index, block.output, block.steps.emit)));
  } else {
    const blockOffsets = recording.blocks.map((block, index) => addBlockSegment(wire, NS, index, block.input));
    recording.blocks.forEach((block, index) => {
      wire.activate(block.steps.cipher, blockOffsets[index] ?? []);
      wire.activate(block.steps.xor, index === 0 ? ivOffsets : (blockOffsets[index - 1] ?? []));
    });
  }
  return wire.toFacet();
}
