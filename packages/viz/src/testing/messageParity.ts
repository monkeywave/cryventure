import { extractParams, type Messages } from '@cryventure/core';

/** Human-readable parity problems between two locale catalogs (empty = in sync). */
export function messageParityProblems(reference: Messages, other: Messages, labels: [string, string] = ['en', 'de']): string[] {
  const [refLabel, otherLabel] = labels;
  const problems: string[] = [];
  for (const key of Object.keys(reference)) {
    if (!Object.hasOwn(other, key)) problems.push(`${key}: missing in ${otherLabel}`);
  }
  for (const [key, value] of Object.entries(other)) {
    const refValue = reference[key];
    if (refValue === undefined) problems.push(`${key}: missing in ${refLabel}`);
    else if (extractParams(refValue).sort().join() !== extractParams(value).sort().join()) problems.push(`${key}: {{params}} differ`);
  }
  for (const [label, catalog] of [[refLabel, reference], [otherLabel, other]] as const) {
    for (const [key, value] of Object.entries(catalog)) if (value.trim() === '') problems.push(`${key}: empty in ${label}`);
  }
  return problems;
}
