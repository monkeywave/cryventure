// @ts-check
/**
 * Post-build step (docs/M3.md §11): writes `manifest.webmanifest` and a Workbox service worker
 * precaching all of `dist/` (Pagefind included) at the base root. Skipped when `CV_PWA=false`.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { generateSW } from 'workbox-build';
import {
  assertPrecacheBudget,
  buildManifest,
  formatMegabytes,
  isPwaEnabled,
  MANIFEST_FILENAME,
  normalizeBase,
  workboxOptions,
} from './pwa.mjs';

const distDir = fileURLToPath(new URL('../dist', import.meta.url));

async function main() {
  if (!isPwaEnabled(process.env)) {
    console.log('[pwa] CV_PWA=false: no service worker or manifest.');
    return;
  }
  const base = normalizeBase(process.env.CV_BASE);
  await writeFile(`${distDir}/${MANIFEST_FILENAME}`, `${JSON.stringify(buildManifest(base), null, 2)}\n`);

  const { count, size, warnings } = await generateSW(workboxOptions({ distDir, base }));
  warnings.forEach((warning) => console.warn(`[pwa] ${warning}`));
  console.log(`[pwa] sw.js precaches ${count} files, ${formatMegabytes(size)} (scope ${base}).`);
  assertPrecacheBudget(size);
}

main().catch((error) => {
  console.error(`[pwa] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
