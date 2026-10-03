import type { ModePadding } from '../modes/modeKit.ts';
import type { Pkcs7UnpadResult } from '../padding/pkcs7.ts';
import { padStep, type PadStep } from './paddingSteps.ts';

/**
 * Shared setup of the traced ECB/CBC recordings (docs/M3.md §4): the encrypt input region and the
 * PKCS#7 pad step, recorded once before the block scopes because it prepares the whole input.
 */

/** The pad step and the bytes it appended. */
export interface PadRecord {
  step: number;
  bytes: number[];
}

/** The unpad step and the PKCS#7 check it narrates. */
export interface UnpadRecord {
  step: number;
  result: Pkcs7UnpadResult;
}

/** What `recordPadding` needs from a `BlockOpRecorder` whose regions include `input` and whose ops include `pad`. */
export interface PadRecorder {
  topLevelOp(step: PadStep): number;
}

/** Length of the encrypt input region: the data, plus the PKCS#7 padding when enabled. */
export function encryptInputLength(dataLength: number, blockSize: number, padding: ModePadding): number {
  return padding === 'pkcs7' ? dataLength + blockSize - (dataLength % blockSize) : dataLength;
}

/** The input region before the pad step: the data, then zeros where the padding goes. */
export function unpaddedInputRegion(data: readonly number[], length: number): number[] {
  return [...data, ...new Array<number>(length - data.length).fill(0)];
}

/** Records the PKCS#7 pad step (top level) when `padding` is `pkcs7`; returns the bytes to encrypt. */
export function recordPadding(
  recorder: PadRecorder,
  namespace: string,
  data: number[],
  blockSize: number,
  padding: ModePadding,
): { padded: number[]; pad?: PadRecord } {
  if (padding !== 'pkcs7') return { padded: data };
  const { step, padded } = padStep(namespace, data, blockSize);
  return { padded, pad: { step: recorder.topLevelOp(step), bytes: padded.slice(data.length) } };
}
