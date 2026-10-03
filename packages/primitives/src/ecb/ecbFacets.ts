import {
  addBlockSegment,
  addPadNode,
  addUnpadNode,
  blockSegmentId,
  ChainBuilder,
  chainLabel,
  cipherZoom,
  i18nRef,
  laneNodes,
  WireBuilder,
  type BlockCipher,
  type ChainFacet,
  type ModeDirection,
  type PaddedModeBlocks,
  type WireFacet,
} from '@cryventure/core';
import type { EcbBlockTrace } from './ecbTrace.ts';

/** The chain and wire facets of an ECB recording (docs/M3.md §6). */
const NS = 'plugin.ecb';

export interface EcbFacetContext {
  direction: ModeDirection;
  cipher: BlockCipher;
  key: Uint8Array;
}

const label = (name: string, n?: number) => chainLabel(NS, name, n);

/** One independent lane: input → E_K or D_K → output. Encryption nodes zoom into the cipher's own lab; their output is sent on the wire. */
function lane(chain: ChainBuilder, block: EcbBlockTrace, index: number, context: EcbFacetContext): void {
  const n = index + 1;
  const encrypting = context.direction === 'encrypt';
  const node = laneNodes(chain, index);
  const input = node('input', 'input', label(encrypting ? 'plaintext' : 'ciphertext', n), block.input, -1);
  const zoom = encrypting ? cipherZoom(context.cipher, context.key, block.input) : {};
  const cipher = node('cipher', 'cipher', label(encrypting ? 'encrypt' : 'decrypt'), block.output, block.steps.cipher, input, zoom);
  const sent = encrypting ? { segmentId: blockSegmentId(index) } : {};
  node('output', 'output', label(encrypting ? 'ciphertext' : 'plaintext', n), block.output, block.steps.emit, cipher, sent);
}

export function ecbChain(recording: PaddedModeBlocks<EcbBlockTrace>, context: EcbFacetContext): ChainFacet {
  const chain = new ChainBuilder();
  recording.blocks.forEach((block, index) => lane(chain, block, index, context));
  addPadNode(chain, NS, recording);
  addUnpadNode(chain, NS, recording);
  return chain.toFacet({ mode: 'ecb', direction: context.direction, formula: i18nRef(`${NS}.formula.${context.direction}`) });
}

/** What travels: the ciphertext blocks, sent and lit when emitted (encrypt) or lit when deciphered (decrypt). */
export function ecbWire(recording: PaddedModeBlocks<EcbBlockTrace>, context: Pick<EcbFacetContext, 'direction'>): WireFacet {
  const wire = new WireBuilder();
  recording.blocks.forEach((block, index) => {
    if (context.direction === 'encrypt') wire.activate(block.steps.emit, addBlockSegment(wire, NS, index, block.output, block.steps.emit));
    else wire.activate(block.steps.cipher, addBlockSegment(wire, NS, index, block.input));
  });
  return wire.toFacet();
}
