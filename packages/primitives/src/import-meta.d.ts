/**
 * Minimal typing for Vite's `import.meta.glob` (vite/client types are not resolvable from
 * this package without a direct `vite` dependency).
 */
interface ImportMetaGlobOptions {
  eager?: boolean;
  import?: string;
}

interface ImportMeta {
  glob<M = unknown>(
    pattern: string | string[],
    options: ImportMetaGlobOptions & { eager: true },
  ): Record<string, M>;
}
