import { byteToHex } from '../bytes.ts';
import { i18nRef, type I18nRef, type TranslateParams } from '../i18n.ts';
import { pkcs7Pad, pkcs7Unpad, type Pkcs7UnpadResult } from '../padding/pkcs7.ts';
import type { StepInput } from '../tracer.ts';
import { highlight } from './stepParts.ts';

/**
 * The PKCS#7 steps of the traced modes (docs/M3.md §4): `pad` writes into the `input` region before
 * encryption, `unpad` checks the `output` region after decryption. Narration keys:
 * `<ns>.step.pad`, `<ns>.step.unpad` and `<ns>.step.unpadInvalid.<reason>`.
 */

export type PadStep = StepInput<'input', { op: 'pad' }>;
export type UnpadStep = StepInput<'output', { op: 'unpad' }>;

/** Pads `data` and returns the padded bytes with the step that writes the pad bytes after it. */
export function padStep(namespace: string, data: readonly number[], blockSize: number): { step: PadStep; padded: number[] } {
  const padded = Array.from(pkcs7Pad(Uint8Array.from(data), blockSize));
  const padBytes = padded.slice(data.length);
  const indices = padBytes.map((_, index) => data.length + index);
  const step: PadStep = {
    op: 'pad',
    writes: [{ region: 'input', offset: data.length, values: padBytes }],
    highlights: [highlight('input', 'write', indices)],
    narration: i18nRef(`${namespace}.step.pad`, { count: padBytes.length, byte: byteToHex(padBytes.length), length: padded.length }),
  };
  return { step, padded };
}

/** Params of each invalid-padding narration (each template uses exactly these). */
function invalidReasonParams(output: readonly number[], blockSize: number, result: Pkcs7UnpadResult & { ok: false }): TranslateParams {
  const byte = byteToHex(output[output.length - 1] ?? 0);
  switch (result.reason) {
    case 'pad-too-long':
      return { byte, blockSize };
    case 'inconsistent-pad-bytes':
      return { byte, index: result.index ?? 0, found: byteToHex(output[result.index ?? 0] ?? 0) };
    default:
      return {};
  }
}

function unpadNarration(namespace: string, output: readonly number[], blockSize: number, result: Pkcs7UnpadResult): I18nRef {
  if (result.ok) return i18nRef(`${namespace}.step.unpad`, { count: result.padLength, byte: byteToHex(result.padLength), length: result.data.length });
  return i18nRef(`${namespace}.step.unpadInvalid.${result.reason}`, invalidReasonParams(output, blockSize, result));
}

function unpadIndices(output: readonly number[], result: Pkcs7UnpadResult): number[] {
  const last = output.length - 1;
  if (result.ok) return Array.from({ length: result.padLength }, (_, index) => output.length - result.padLength + index);
  return result.index === undefined ? [last] : [result.index, last];
}

/**
 * Checks the PKCS#7 padding of the decrypted `output`. Invalid padding is not an error: the step
 * narrates the reason (`pkcs7Unpad`) and `result.ok` is false.
 */
export function unpadStep(namespace: string, output: readonly number[], blockSize: number): { step: UnpadStep; result: Pkcs7UnpadResult } {
  const result = pkcs7Unpad(Uint8Array.from(output), blockSize);
  const indices = output.length === 0 ? [] : unpadIndices(output, result);
  const step: UnpadStep = {
    op: 'unpad',
    writes: [],
    highlights: [highlight('output', 'read', indices)],
    narration: unpadNarration(namespace, output, blockSize, result),
  };
  return { step, result };
}
