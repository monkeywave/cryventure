import { parseHexOrThrow, RecordingTracer } from '@cryventure/core';
import { aesRegions, emptySnapshot, type AesOp, type AesRegion } from './aesTrace.ts';
import { roundCount } from './keyExpansion.ts';

/** Test-only helpers (not exported from the package). */
export function hexBytes(hex: string): number[] {
  return Array.from(parseHexOrThrow(hex));
}

export function recordingTracerFor(keyLength: number): RecordingTracer<AesRegion, AesOp> {
  const rounds = roundCount(keyLength);
  return new RecordingTracer<AesRegion, AesOp>(aesRegions(rounds), emptySnapshot(rounds));
}
