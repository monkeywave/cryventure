import { getFacet, stepContexts, type AnyStateFacet, type ChoreographyContext } from '@cryventure/core';
import { decryptBlock } from './cipher.ts';
import { AES_PRESETS } from './manifest.ts';
import { run } from './module.ts';
import { hexBytes, recordingTracerFor } from './testHelpers.ts';

/** Test-only: a choreography context for every step of an encryption (or decryption) run. */

export function encryptionContexts(detail: 'op' | 'round' = 'op'): ChoreographyContext[] {
  const result = run({ ...AES_PRESETS[3]!.params, detail });
  if (!result.ok) throw new Error('run failed');
  return stepContexts(getFacet<AnyStateFacet>(result.trace, 'state')!);
}

export function decryptionContexts(): ChoreographyContext[] {
  const tracer = recordingTracerFor(16);
  decryptBlock(hexBytes('000102030405060708090a0b0c0d0e0f'), hexBytes('69c4e0d86a7b0430d8cdb78070b4c55a'), tracer, 'op');
  return stepContexts(tracer.toFacet());
}
