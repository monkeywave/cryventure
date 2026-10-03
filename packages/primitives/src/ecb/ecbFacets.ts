import { ChainBuilder, i18nRef, toHex, WireBuilder, type ChainFacet, type ModeDirection, type WireFacet } from '@cryventure/core';
import type { EcbBlockTrace, EcbRecording } from './ecbTrace.ts';

/** The chain and wire facets of an ECB recording (docs/M3.md §6). */
const NS = 'plugin.ecb';

export interface EcbFacetContext {
  direction: ModeDirection;
  cipherId: string;
  keyHex: string;
}

const nodeId = (index: number, part: string): string => `b${index}.${part}`;
const label = (name: string, n?: number) => i18nRef(`${NS}.chain.${name}`, n === undefined ? undefined : { n });

/** One independent lane: input → E_K or D_K → output. Encryption nodes zoom into the cipher's own lab. */
function lane(chain: ChainBuilder, block: EcbBlockTrace, index: number, context: EcbFacetContext, inputActiveAt: number): void {
  const n = index + 1;
  const encrypting = context.direction === 'encrypt';
  chain.node({ id: nodeId(index, 'input'), block: index, kind: 'input', label: label(encrypting ? 'plaintext' : 'ciphertext', n), bytes: block.input, activeAt: inputActiveAt });
  const zoom = encrypting ? { zoom: { producerId: context.cipherId, params: { keyHex: context.keyHex, plaintextHex: toHex(block.input), detail: 'op' } } } : {};
  chain.node({ id: nodeId(index, 'cipher'), block: index, kind: 'cipher', label: label(encrypting ? 'encrypt' : 'decrypt'), bytes: block.output, activeAt: block.steps.cipher, ...zoom });
  chain.link(nodeId(index, 'input'), nodeId(index, 'cipher'));
  chain.node({ id: nodeId(index, 'output'), block: index, kind: 'output', label: label(encrypting ? 'ciphertext' : 'plaintext', n), bytes: block.output, activeAt: block.steps.emit });
  chain.link(nodeId(index, 'cipher'), nodeId(index, 'output'));
}

function addPadNode(chain: ChainBuilder, recording: EcbRecording): void {
  const { pad } = recording;
  if (pad === undefined) return;
  chain.node({ id: 'pad', block: -1, kind: 'pad', label: label('pad'), bytes: pad.bytes, activeAt: pad.step });
  chain.link('pad', nodeId(recording.blocks.length - 1, 'input'));
}

function addUnpadNode(chain: ChainBuilder, recording: EcbRecording): void {
  const { unpad, processed } = recording;
  if (unpad === undefined) return;
  const last = recording.blocks.length - 1;
  const bytes = unpad.result.ok ? processed.slice(processed.length - unpad.result.padLength) : processed.slice(-1);
  chain.node({ id: 'unpad', block: last, kind: 'pad', label: label(unpad.result.ok ? 'unpad' : 'unpadInvalid'), bytes, activeAt: unpad.step });
  chain.link(nodeId(last, 'output'), 'unpad');
}

export function ecbChain(recording: EcbRecording, context: EcbFacetContext): ChainFacet {
  const chain = new ChainBuilder();
  const last = recording.blocks.length - 1;
  // PKCS#7 bytes always land in the last block, which is complete only after the pad step.
  const padStep = recording.pad?.step ?? -1;
  recording.blocks.forEach((block, index) => lane(chain, block, index, context, index === last ? padStep : -1));
  addPadNode(chain, recording);
  addUnpadNode(chain, recording);
  return chain.toFacet({ mode: 'ecb', direction: context.direction, formula: i18nRef(`${NS}.formula.${context.direction}`) });
}

/** What travels: the ciphertext blocks, lit when emitted (encrypt) or deciphered (decrypt). */
export function ecbWire(recording: EcbRecording, context: EcbFacetContext): WireFacet {
  const wire = new WireBuilder();
  recording.blocks.forEach((block, index) => {
    const encrypting = context.direction === 'encrypt';
    const offsets = wire.segment({ id: `c${index}`, role: 'ciphertext', label: i18nRef(`${NS}.wire.block`, { n: index + 1 }), bytes: encrypting ? block.output : block.input, block: index });
    wire.activate(encrypting ? block.steps.emit : block.steps.cipher, offsets);
  });
  return wire.toFacet();
}
