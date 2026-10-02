import { parseHex, RecordingTracer } from '@cryventure/core';
import { aesRegions, emptySnapshot, type AesOp, type AesRegion } from './aesTrace.ts';
import { roundCount } from './keyExpansion.ts';

/** Test-only helpers (not exported from the package). */
export function hexBytes(hex: string): number[] {
  const parsed = parseHex(hex);
  if (!parsed.ok) throw new Error(`bad hex ${hex}`);
  return Array.from(parsed.bytes);
}

export function recordingTracerFor(keyLength: number): RecordingTracer<AesRegion, AesOp> {
  const rounds = roundCount(keyLength);
  return new RecordingTracer<AesRegion, AesOp>(aesRegions(rounds), emptySnapshot(rounds));
}
