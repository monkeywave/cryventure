import { ChainBuilder, i18nRef, toHex, WireBuilder, type ChainFacet, type ModeDirection, type WireFacet } from '@cryventure/core';
import type { CbcBlockTrace, CbcRecording } from './cbcTrace.ts';

/** The chain and wire facets of a CBC recording (docs/M3.md §6). */
const NS = 'plugin.cbc';

export interface CbcFacetContext {
  direction: ModeDirection;
  cipherId: string;
  keyHex: string;
  iv: number[];
}

const nodeId = (index: number, part: string): string => `b${index}.${part}`;
const label = (name: string, n?: number) => i18nRef(`${NS}.chain.${name}`, n === undefined ? undefined : { n });

/** Encryption: Pᵢ and Cᵢ₋₁ → ⊕ → E_K → Cᵢ. Each E_K node zooms into the cipher's own lab. */
function encryptLane(chain: ChainBuilder, block: CbcBlockTrace, index: number, context: CbcFacetContext, inputActiveAt: number): void {
  const n = index + 1;
  chain.node({ id: nodeId(index, 'input'), block: index, kind: 'input', label: label('plaintext', n), bytes: block.input, activeAt: inputActiveAt });
  chain.node({ id: nodeId(index, 'xor'), block: index, kind: 'xor', label: label('xor'), bytes: block.cipherIn, activeAt: block.steps.xor });
  chain.link([nodeId(index, 'input'), index === 0 ? 'iv' : nodeId(index - 1, 'output')], nodeId(index, 'xor'));
  const zoom = { producerId: context.cipherId, params: { keyHex: context.keyHex, plaintextHex: toHex(block.cipherIn), detail: 'op' } };
  chain.node({ id: nodeId(index, 'cipher'), block: index, kind: 'cipher', label: label('encrypt'), bytes: block.cipherOut, activeAt: block.steps.cipher, zoom });
  chain.link(nodeId(index, 'xor'), nodeId(index, 'cipher'));
  chain.node({ id: nodeId(index, 'output'), block: index, kind: 'output', label: label('ciphertext', n), bytes: block.output, activeAt: block.steps.emit });
  chain.link(nodeId(index, 'cipher'), nodeId(index, 'output'));
}

/** Decryption: Cᵢ → D_K → ⊕ Cᵢ₋₁ → Pᵢ. */
function decryptLane(chain: ChainBuilder, block: CbcBlockTrace, index: number): void {
  const n = index + 1;
  chain.node({ id: nodeId(index, 'input'), block: index, kind: 'input', label: label('ciphertext', n), bytes: block.input, activeAt: -1 });
  chain.node({ id: nodeId(index, 'cipher'), block: index, kind: 'cipher', label: label('decrypt'), bytes: block.cipherOut, activeAt: block.steps.cipher });
  chain.link(nodeId(index, 'input'), nodeId(index, 'cipher'));
  chain.node({ id: nodeId(index, 'xor'), block: index, kind: 'xor', label: label('xor'), bytes: block.output, activeAt: block.steps.xor });
  chain.link([nodeId(index, 'cipher'), index === 0 ? 'iv' : nodeId(index - 1, 'input')], nodeId(index, 'xor'));
  chain.node({ id: nodeId(index, 'output'), block: index, kind: 'output', label: label('plaintext', n), bytes: block.output, activeAt: block.steps.emit });
  chain.link(nodeId(index, 'xor'), nodeId(index, 'output'));
}

function addPadNode(chain: ChainBuilder, recording: CbcRecording): void {
  const { pad } = recording;
  if (pad === undefined) return;
  chain.node({ id: 'pad', block: -1, kind: 'pad', label: label('pad'), bytes: pad.bytes, activeAt: pad.step });
  chain.link('pad', nodeId(recording.blocks.length - 1, 'input'));
}

function addUnpadNode(chain: ChainBuilder, recording: CbcRecording): void {
  const { unpad } = recording;
  if (unpad === undefined) return;
  const last = recording.blocks.length - 1;
  const bytes = unpad.result.ok ? recording.processed.slice(recording.processed.length - unpad.result.padLength) : recording.processed.slice(-1);
  const name = unpad.result.ok ? 'unpad' : 'unpadInvalid';
  chain.node({ id: 'unpad', block: last, kind: 'pad', label: label(name), bytes, activeAt: unpad.step });
  chain.link(nodeId(last, 'output'), 'unpad');
}

export function cbcChain(recording: CbcRecording, context: CbcFacetContext): ChainFacet {
  const chain = new ChainBuilder();
  chain.node({ id: 'iv', block: -1, kind: 'iv', label: label('iv'), bytes: context.iv, valueRef: 'iv', activeAt: -1 });
  if (context.direction === 'encrypt') {
    // PKCS#7 bytes always land in the last block, which is complete only after the pad step.
    const last = recording.blocks.length - 1;
    const padStep = recording.pad?.step ?? -1;
    recording.blocks.forEach((block, index) => encryptLane(chain, block, index, context, index === last ? padStep : -1));
    addPadNode(chain, recording);
  } else {
    recording.blocks.forEach((block, index) => decryptLane(chain, block, index));
    addUnpadNode(chain, recording);
  }
  return chain.toFacet({ mode: 'cbc', direction: context.direction, formula: i18nRef(`${NS}.formula.${context.direction}`) });
}

/**
 * What travels: the IV, then the ciphertext blocks. Encrypting lights each block when it is emitted;
 * decrypting lights the block being deciphered, then the one it is XORed with.
 */
export function cbcWire(recording: CbcRecording, context: CbcFacetContext): WireFacet {
  const wire = new WireBuilder();
  const ivOffsets = wire.segment({ id: 'iv', role: 'iv', label: i18nRef(`${NS}.wire.iv`), bytes: context.iv, valueRef: 'iv' });
  const ciphertext = (block: CbcBlockTrace) => (context.direction === 'encrypt' ? block.output : block.input);
  const blockOffsets = recording.blocks.map((block, index) =>
    wire.segment({ id: `c${index}`, role: 'ciphertext', label: i18nRef(`${NS}.wire.block`, { n: index + 1 }), bytes: ciphertext(block), block: index }),
  );
  if (context.direction === 'encrypt') {
    wire.activate(-1, ivOffsets);
    recording.blocks.forEach((block, index) => wire.activate(block.steps.emit, blockOffsets[index] ?? []));
  } else {
    recording.blocks.forEach((block, index) => {
      wire.activate(block.steps.cipher, blockOffsets[index] ?? []);
      wire.activate(block.steps.xor, index === 0 ? ivOffsets : (blockOffsets[index - 1] ?? []));
    });
  }
  return wire.toFacet();
}
