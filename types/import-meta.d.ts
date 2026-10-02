/**
 * Minimal typing for Vite's `import.meta.glob`, shared by the packages that discover plugins with it
 * (vite/client types are not resolvable from those packages without a direct `vite` dependency).
 * Included via each package's tsconfig `include`.
 */
interface ImportMetaGlobOptions {
  eager?: boolean;
  import?: string;
}

interface ImportMeta {
  glob<M = unknown>(pattern: string | string[], options: ImportMetaGlobOptions & { eager: true }): Record<string, M>;
}
