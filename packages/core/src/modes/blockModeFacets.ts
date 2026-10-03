import { toHex } from '../bytes.ts';
import type { ChainNode, ChainNodeKind } from '../facets/chain.ts';
import type { ChainBuilder, WireBuilder } from '../facets/modeFacetBuilders.ts';
import { valueRef, type ValueRef, type ValuesFacet } from '../facets/values.ts';
import { i18nRef, type I18nRef } from '../i18n.ts';
import { INITIAL_STEP_INDEX } from '../facets/validation.ts';
import type { BlockCipher } from '../ports.ts';
import { processedBytes, type PaddedModeBlocks } from '../recording/blockModeRecording.ts';
import type { BlockModeOutput, ModeDirection } from './modeKit.ts';

/** Shared pieces of the traced modes' narration, chain and values facets (docs/M3.md §4, §6). */

/** The cipher as narrations name it, e.g. `AES`. */
export const cipherName = (cipher: Pick<BlockCipher, 'id'>): string => cipher.id.toUpperCase();

/** Stable id of a node in lane `index`, e.g. `b2.xor`. */
export const laneNodeId = (index: number, part: string): string => `b${index}.${part}`;

/** The chain label `<ns>.chain.<name>`, with `{{n}}` when given. */
export const chainLabel = (namespace: string, name: string, n?: number): I18nRef => i18nRef(`${namespace}.chain.${name}`, n === undefined ? undefined : { n });

/** `{ zoom }` into the cipher's own lab encrypting `block` under `key` (the host links it via the producer's `blockLabParams`). */
export function cipherZoom(cipher: Pick<BlockCipher, 'id'>, key: Uint8Array, block: readonly number[]): Required<Pick<ChainNode, 'zoom'>> {
  return { zoom: { producerId: cipher.id, keyHex: toHex(key), blockHex: toHex(block) } };
}

/** Optional fields of a lane node. */
export type LaneNodeExtras = Pick<ChainNode, 'valueRef' | 'segmentId' | 'zoom'>;

/** Adds a node to one lane and links it from `from` (node ids) when given; returns the node id. */
export type LaneNode = (
  part: string,
  kind: ChainNodeKind,
  label: I18nRef,
  bytes: number[],
  activeAt: number,
  from?: string | readonly string[],
  extras?: LaneNodeExtras,
) => string;

/** The `LaneNode` of lane `index`: node ids are `laneNodeId(index, part)`. */
export function laneNodes(chain: ChainBuilder, index: number): LaneNode {
  return (part, kind, label, bytes, activeAt, from, extras = {}) => {
    const id = chain.node({ id: laneNodeId(index, part), block: index, kind, label, bytes, activeAt, ...extras });
    if (from !== undefined) chain.link(from, id);
    return id;
  };
}

/** Id of the wire segment of block `index`, e.g. `c2`. */
export const blockSegmentId = (index: number): string => `c${index}`;

/** Appends the ciphertext segment of block `index` (label `<ns>.wire.block`) and returns its offsets. */
export function addBlockSegment(wire: WireBuilder, namespace: string, index: number, bytes: number[], availableAt?: number): number[] {
  const segment = { id: blockSegmentId(index), role: 'ciphertext' as const, label: i18nRef(`${namespace}.wire.block`, { n: index + 1 }), bytes, block: index };
  return wire.segment(availableAt === undefined ? segment : { ...segment, availableAt });
}

/** The PKCS#7 pad node (before the lanes), feeding the last lane's input, which is complete only after the pad step. */
export function addPadNode(chain: ChainBuilder, namespace: string, recording: PaddedModeBlocks): void {
  const { pad } = recording;
  if (pad === undefined) return;
  const lastInput = laneNodeId(recording.blocks.length - 1, 'input');
  chain.delay(lastInput, pad.step);
  chain.node({ id: 'pad', block: -1, kind: 'pad', label: chainLabel(namespace, 'pad'), bytes: pad.bytes, activeAt: pad.step });
  chain.link('pad', lastInput);
}

/** The unpad node after the last lane's output: the pad bytes, or the last byte when the padding is invalid. */
export function addUnpadNode(chain: ChainBuilder, namespace: string, recording: PaddedModeBlocks): void {
  const { unpad } = recording;
  if (unpad === undefined) return;
  const processed = processedBytes(recording);
  const last = recording.blocks.length - 1;
  const bytes = unpad.result.ok ? processed.slice(processed.length - unpad.result.padLength) : processed.slice(-1);
  chain.node({ id: 'unpad', block: last, kind: 'pad', label: chainLabel(namespace, unpad.result.ok ? 'unpad' : 'unpadInvalid'), bytes, activeAt: unpad.step });
  chain.link(laneNodeId(last, 'output'), 'unpad');
}

export interface BlockModeValuesInput {
  direction: ModeDirection;
  key: number[];
  /** The input as given (plaintext or ciphertext). */
  data: number[];
  /** The run's output, which becomes a value. */
  output: BlockModeOutput;
  lastStep: number;
  /** Further values present from the initial state on (e.g. the IV), listed after the key. */
  initial?: ValueRef[];
}

/** ECB/CBC values: key, `initial`, the input from the initial state on; the output from the last step. */
export function blockModeValues(namespace: string, input: BlockModeValuesInput): ValuesFacet {
  const encrypting = input.direction === 'encrypt';
  const inputName = encrypting ? 'plaintext' : 'ciphertext';
  const values = [
    valueRef(namespace, 'key', 'key', input.key, INITIAL_STEP_INDEX),
    ...(input.initial ?? []),
    valueRef(namespace, inputName, inputName, input.data, INITIAL_STEP_INDEX),
    valueRef(namespace, input.output.name, encrypting ? 'ciphertext' : 'plaintext', input.output.bytes, input.lastStep),
  ];
  return { kind: 'values', schemaVersion: 1, values };
}
