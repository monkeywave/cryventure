import {
  addPadNode,
  addUnpadNode,
  ChainBuilder,
  chainLabel,
  cipherZoom,
  i18nRef,
  laneNodeId as nodeId,
  WireBuilder,
  type BlockCipher,
  type ChainFacet,
  type ModeDirection,
  type WireFacet,
} from '@cryventure/core';
import type { EcbBlockTrace, EcbRecording } from './ecbTrace.ts';

/** The chain and wire facets of an ECB recording (docs/M3.md §6). */
const NS = 'plugin.ecb';

export interface EcbFacetContext {
  direction: ModeDirection;
  cipher: BlockCipher;
  key: Uint8Array;
}

const label = (name: string, n?: number) => chainLabel(NS, name, n);

/** One independent lane: input → E_K or D_K → output. Encryption nodes zoom into the cipher's own lab. */
function lane(chain: ChainBuilder, block: EcbBlockTrace, index: number, context: EcbFacetContext, inputActiveAt: number): void {
  const n = index + 1;
  const encrypting = context.direction === 'encrypt';
  chain.node({ id: nodeId(index, 'input'), block: index, kind: 'input', label: label(encrypting ? 'plaintext' : 'ciphertext', n), bytes: block.input, activeAt: inputActiveAt });
  const zoom = encrypting ? cipherZoom(context.cipher, context.key, block.input) : {};
  chain.node({ id: nodeId(index, 'cipher'), block: index, kind: 'cipher', label: label(encrypting ? 'encrypt' : 'decrypt'), bytes: block.output, activeAt: block.steps.cipher, ...zoom });
  chain.link(nodeId(index, 'input'), nodeId(index, 'cipher'));
  chain.node({ id: nodeId(index, 'output'), block: index, kind: 'output', label: label(encrypting ? 'ciphertext' : 'plaintext', n), bytes: block.output, activeAt: block.steps.emit });
  chain.link(nodeId(index, 'cipher'), nodeId(index, 'output'));
}

export function ecbChain(recording: EcbRecording, context: EcbFacetContext): ChainFacet {
  const chain = new ChainBuilder();
  const last = recording.blocks.length - 1;
  // PKCS#7 bytes always land in the last block, which is complete only after the pad step.
  const padStep = recording.pad?.step ?? -1;
  recording.blocks.forEach((block, index) => lane(chain, block, index, context, index === last ? padStep : -1));
  addPadNode(chain, NS, recording);
  addUnpadNode(chain, NS, recording);
  return chain.toFacet({ mode: 'ecb', direction: context.direction, formula: i18nRef(`${NS}.formula.${context.direction}`) });
}

/** What travels: the ciphertext blocks, lit when emitted (encrypt) or deciphered (decrypt). */
export function ecbWire(recording: EcbRecording, context: EcbFacetContext): WireFacet {
  const wire = new WireBuilder();
  recording.blocks.forEach((block, index) => {
    const encrypting = context.direction === 'encrypt';
    const offsets = wire.segment({ id: `c${index}`, role: 'ciphertext', label: i18nRef(`${NS}.wire.block`, { n: index + 1 }), bytes: encrypting ? block.output : block.input, block: index });
    if (encrypting) wire.emit(block.steps.emit, offsets);
    else wire.activate(block.steps.cipher, offsets);
  });
  return wire.toFacet();
}
