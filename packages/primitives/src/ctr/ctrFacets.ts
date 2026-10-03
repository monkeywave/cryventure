import {
  addBlockSegment,
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
  type WireFacet,
} from '@cryventure/core';
import type { CtrBlockTrace, CtrRecording } from './ctrTrace.ts';

/** The chain and wire facets of a CTR recording (docs/M3.md §6). */
const NS = 'plugin.ctr';

export interface CtrFacetContext {
  cipher: BlockCipher;
  key: Uint8Array;
}

const label = (name: string, n?: number) => chainLabel(NS, name, n);

/** One lane: Tᵢ → E_K → keystream; Pᵢ ⊕ keystream → Cᵢ, sent on the wire. E_K always encrypts, so every cipher node zooms. */
function lane(chain: ChainBuilder, block: CtrBlockTrace, index: number, context: CtrFacetContext): void {
  const n = index + 1;
  const node = laneNodes(chain, index);
  const previousCounter = index === 0 ? undefined : nodeId(index - 1, 'counter');
  const counter = node('counter', 'counter', label('counter', n), block.counter, block.steps.counter, previousCounter, index === 0 ? { valueRef: 'counter' } : {});
  const cipher = node('cipher', 'cipher', label('encrypt'), block.keystream, block.steps.cipher, counter, cipherZoom(context.cipher, context.key, block.counter));
  const keystream = node('keystream', 'keystream', label('keystream', n), block.keystream.slice(0, block.input.length), block.steps.cipher, cipher);
  const input = node('input', 'input', label('plaintext', n), block.input, -1);
  const xor = node('xor', 'xor', label('xor'), block.output, block.steps.xor, [input, keystream]);
  node('output', 'output', label('ciphertext', n), block.output, block.steps.xor, xor, { segmentId: blockSegmentId(index) });
}

export function ctrChain(recording: CtrRecording, context: CtrFacetContext): ChainFacet {
  const chain = new ChainBuilder();
  recording.blocks.forEach((block, index) => lane(chain, block, index, context));
  return chain.toFacet({ mode: 'ctr', direction: 'encrypt', formula: i18nRef(`${NS}.formula.encrypt`) });
}

/** What travels: the initial counter block (the nonce), then the output blocks, each lit when it is XORed. */
export function ctrWire(recording: CtrRecording, initialCounter: number[]): WireFacet {
  const wire = new WireBuilder();
  wire.activate(-1, wire.segment({ id: 'nonce', role: 'nonce', label: i18nRef(`${NS}.wire.nonce`), bytes: initialCounter, valueRef: 'counter' }));
  recording.blocks.forEach((block, index) => wire.activate(block.steps.xor, addBlockSegment(wire, NS, index, block.output, block.steps.xor)));
  return wire.toFacet();
}
