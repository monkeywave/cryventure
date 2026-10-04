import { runPrimitive, type PrimitiveManifest, type PrimitiveRecording, type RunResult, type ValidationResult } from '@cryventure/core';

/**
 * `runPrimitive` for producers that check more than their params before recording (port members,
 * lengths only known with the resolved function): validates `params` once, runs `check` on the
 * validated value (its failure is the run error) and records with what `check` returned.
 */
export function runPrimitiveChecked<P, C>(
  manifest: PrimitiveManifest<P>,
  params: unknown,
  check: (value: P) => ValidationResult<C>,
  record: (value: P, checked: C) => PrimitiveRecording,
): RunResult {
  const validated = manifest.validate(params);
  if (!validated.ok) return validated;
  const checked = check(validated.value);
  if (!checked.ok) return checked;
  // The params are validated: hand runPrimitive that result instead of validating them again.
  return runPrimitive({ ...manifest, validate: () => validated }, validated.value, (value) => record(value, checked.value));
}
