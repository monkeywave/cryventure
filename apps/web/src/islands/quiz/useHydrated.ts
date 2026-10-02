import { useEffect, useState } from 'react';

/** `false` during SSR and the hydration render, `true` afterwards: lets an island keep its no-JS fallback until it is interactive. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
