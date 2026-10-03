import { ChainBuilder, i18nRef, toHex, WireBuilder, type ChainFacet, type WireFacet } from '@cryventure/core';
import type { CtrBlockTrace, CtrRecording } from './ctrTrace.ts';

/** The chain and wire facets of a CTR recording (docs/M3.md §6). */
const NS = 'plugin.ctr';

export interface CtrFacetContext {
  cipherId: string;
  keyHex: string;
}

const nodeId = (index: number, part: string): string => `b${index}.${part}`;
const label = (name: string, n?: number) => i18nRef(`${NS}.chain.${name}`, n === undefined ? undefined : { n });

/** One lane: Tᵢ → E_K → keystream; Pᵢ ⊕ keystream → Cᵢ. E_K always encrypts, so every cipher node zooms. */
function lane(chain: ChainBuilder, block: CtrBlockTrace, index: number, context: CtrFacetContext): void {
  const n = index + 1;
  chain.node({ id: nodeId(index, 'counter'), block: index, kind: 'counter', label: label('counter', n), bytes: block.counter, activeAt: block.steps.counter, ...(index === 0 ? { valueRef: 'counter' } : {}) });
  if (index > 0) chain.link(nodeId(index - 1, 'counter'), nodeId(index, 'counter'));
  const zoom = { producerId: context.cipherId, params: { keyHex: context.keyHex, plaintextHex: toHex(block.counter), detail: 'op' } };
  chain.node({ id: nodeId(index, 'cipher'), block: index, kind: 'cipher', label: label('encrypt'), bytes: block.keystream, activeAt: block.steps.cipher, zoom });
  chain.link(nodeId(index, 'counter'), nodeId(index, 'cipher'));
  chain.node({ id: nodeId(index, 'keystream'), block: index, kind: 'keystream', label: label('keystream', n), bytes: block.keystream.slice(0, block.input.length), activeAt: block.steps.cipher });
  chain.link(nodeId(index, 'cipher'), nodeId(index, 'keystream'));
  chain.node({ id: nodeId(index, 'input'), block: index, kind: 'input', label: label('plaintext', n), bytes: block.input, activeAt: -1 });
  chain.node({ id: nodeId(index, 'xor'), block: index, kind: 'xor', label: label('xor'), bytes: block.output, activeAt: block.steps.xor });
  chain.link([nodeId(index, 'input'), nodeId(index, 'keystream')], nodeId(index, 'xor'));
  chain.node({ id: nodeId(index, 'output'), block: index, kind: 'output', label: label('ciphertext', n), bytes: block.output, activeAt: block.steps.xor });
  chain.link(nodeId(index, 'xor'), nodeId(index, 'output'));
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
  recording.blocks.forEach((block, index) => {
    const offsets = wire.segment({ id: `c${index}`, role: 'ciphertext', label: i18nRef(`${NS}.wire.block`, { n: index + 1 }), bytes: block.output, block: index });
    wire.activate(block.steps.xor, offsets);
  });
  return wire.toFacet();
}
