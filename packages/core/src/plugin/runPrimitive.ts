import type { PrimitiveManifest, RunResult } from '../registry.ts';
import { facetKey, type FacetKind } from '../trace.ts';

/** What a primitive records from validated params: facets by kind (default variant) and named outputs. */
export interface PrimitiveRecording {
  facets: Partial<Record<FacetKind, unknown>>;
  output: Record<string, number[]>;
}

/**
 * The shared body of a primitive's `run`: validates `params` with the manifest, records them and
 * wraps the recording in a modeled TraceBundle produced by the manifest's id and apiVersion.
 */
export function runPrimitive<P>(manifest: PrimitiveManifest<P>, params: unknown, record: (params: P) => PrimitiveRecording): RunResult {
  const validated = manifest.validate(params);
  if (!validated.ok) return validated;
  const { facets, output } = record(validated.value);
  return {
    ok: true,
    trace: {
      schemaVersion: 1,
      producer: { kind: 'primitive', id: manifest.id, apiVersion: manifest.apiVersion },
      provenance: 'modeled',
      params: validated.value,
      facets: Object.fromEntries(Object.entries(facets).map(([kind, facet]) => [facetKey(kind), facet])),
      output,
    },
  };
}
