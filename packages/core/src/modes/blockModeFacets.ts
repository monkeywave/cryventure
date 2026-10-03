import type { ChainNode } from '../facets/chain.ts';
import type { ChainBuilder } from '../facets/modeFacetBuilders.ts';
import { valueRef, type ValueRef, type ValuesFacet } from '../facets/values.ts';
import { i18nRef, type I18nRef } from '../i18n.ts';
import { INITIAL_STEP_INDEX } from '../facets/validation.ts';
import type { BlockCipher } from '../ports.ts';
import type { PadRecord, UnpadRecord } from '../recording/blockModeRecording.ts';
import type { ModeDirection } from './modeKit.ts';

/** Shared pieces of the traced modes' narration, chain and values facets (docs/M3.md §4, §6). */

/** The cipher as narrations name it, e.g. `AES`. */
export const cipherName = (cipher: Pick<BlockCipher, 'id'>): string => cipher.id.toUpperCase();

/** Stable id of a node in lane `index`, e.g. `b2.xor`. */
export const laneNodeId = (index: number, part: string): string => `b${index}.${part}`;

/** The chain label `<ns>.chain.<name>`, with `{{n}}` when given. */
export const chainLabel = (namespace: string, name: string, n?: number): I18nRef => i18nRef(`${namespace}.chain.${name}`, n === undefined ? undefined : { n });

/** `{ zoom }` into the cipher's own lab encrypting `block`, or nothing when the cipher names no lab params. */
export function cipherZoom(cipher: BlockCipher, key: Uint8Array, block: readonly number[]): Pick<ChainNode, 'zoom'> {
  const params = cipher.labParams?.(key, Uint8Array.from(block));
  return params === undefined ? {} : { zoom: { producerId: cipher.id, params } };
}

/** The part of an ECB/CBC recording the pad and unpad nodes need. */
export interface PaddedModeRecording {
  blocks: readonly unknown[];
  /** Everything the output region ends with (still padded after decryption). */
  processed: number[];
  pad?: PadRecord;
  unpad?: UnpadRecord;
}

/** The PKCS#7 pad node (before the lanes), feeding the last lane's input. */
export function addPadNode(chain: ChainBuilder, namespace: string, recording: PaddedModeRecording): void {
  const { pad } = recording;
  if (pad === undefined) return;
  chain.node({ id: 'pad', block: -1, kind: 'pad', label: chainLabel(namespace, 'pad'), bytes: pad.bytes, activeAt: pad.step });
  chain.link('pad', laneNodeId(recording.blocks.length - 1, 'input'));
}

/** The unpad node after the last lane's output: the pad bytes, or the last byte when the padding is invalid. */
export function addUnpadNode(chain: ChainBuilder, namespace: string, recording: PaddedModeRecording): void {
  const { unpad, processed } = recording;
  if (unpad === undefined) return;
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
  /** The run's named outputs; the first one becomes a value. */
  outputs: Record<string, number[]>;
  lastStep: number;
  /** Further values present from the initial state on (e.g. the IV), listed after the key. */
  initial?: ValueRef[];
}

/** ECB/CBC values: key, `initial`, the input from the initial state on; the output from the last step. */
export function blockModeValues(namespace: string, input: BlockModeValuesInput): ValuesFacet {
  const encrypting = input.direction === 'encrypt';
  const inputName = encrypting ? 'plaintext' : 'ciphertext';
  const [outputName, outputBytes] = Object.entries(input.outputs)[0] ?? ['ciphertext', []];
  const values = [
    valueRef(namespace, 'key', 'key', input.key, INITIAL_STEP_INDEX),
    ...(input.initial ?? []),
    valueRef(namespace, inputName, inputName, input.data, INITIAL_STEP_INDEX),
    valueRef(namespace, outputName, encrypting ? 'ciphertext' : 'plaintext', outputBytes, input.lastStep),
  ];
  return { kind: 'values', schemaVersion: 1, values };
}
