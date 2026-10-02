import { useEffect, useState } from 'react';
import type { ChoreographyModule, PrimitiveManifest } from '@cryventure/core';

/** Loads the producer's optional choreography (code-split); a failed import keeps the generic fallback. */
export async function loadChoreographyModule(producer: Pick<PrimitiveManifest, 'loadChoreography'>): Promise<ChoreographyModule | undefined> {
  try {
    return await producer.loadChoreography?.();
  } catch {
    return undefined;
  }
}

/** The producer's choreography module once loaded; `undefined` until then (views use the fallback). */
export function useChoreographyModule(producer: Pick<PrimitiveManifest, 'loadChoreography'>): ChoreographyModule | undefined {
  const [loaded, setLoaded] = useState<{ producer: object; module: ChoreographyModule | undefined }>();
  useEffect(() => {
    let cancelled = false;
    void loadChoreographyModule(producer).then((module) => {
      if (!cancelled) setLoaded({ producer, module });
    });
    return () => {
      cancelled = true;
    };
  }, [producer]);
  return loaded?.producer === producer ? loaded.module : undefined;
}
