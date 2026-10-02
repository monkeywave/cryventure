import type { ChoreographyContext, StepChoreography } from '@cryventure/core';
import type { AesOpName } from './aesTrace.ts';
import { addRoundKeyChoreography } from './choreo/addRoundKey.ts';
import { mixChoreography } from './choreo/mix.ts';
import { shiftChoreography } from './choreo/shift.ts';
import { substitutionChoreography } from './choreo/substitution.ts';

/**
 * AES step choreographies (ChoreographyModule, loaded lazily via `aesManifest.loadChoreography`).
 * Ops without an entry (input, keyExpansion, output, whole-round steps) use the generic fallback.
 */
type Choreographer = (context: ChoreographyContext) => StepChoreography;

const CHOREOGRAPHERS: ReadonlyMap<AesOpName, Choreographer> = new Map<AesOpName, Choreographer>([
  ['subBytes', substitutionChoreography],
  ['invSubBytes', substitutionChoreography],
  ['shiftRows', shiftChoreography],
  ['invShiftRows', shiftChoreography],
  ['mixColumns', mixChoreography],
  ['invMixColumns', mixChoreography],
  ['addRoundKey', addRoundKeyChoreography],
]);

export function choreograph(context: ChoreographyContext): StepChoreography | undefined {
  return CHOREOGRAPHERS.get(context.step.op as AesOpName)?.(context);
}
