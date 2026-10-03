// @ts-check
/**
 * Post-build step (docs/M3.md §11): writes `manifest.webmanifest` and a Workbox service worker
 * precaching all of `dist/` (Pagefind included) at the base root. With `CV_PWA=false` it writes no
 * manifest and a self-unregistering `sw.js` instead, which removes a worker installed by an earlier build.
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
  selfUnregisteringWorker,
  SW_FILENAME,
  workboxOptions,
} from './pwa.mjs';

const distDir = fileURLToPath(new URL('../dist', import.meta.url));

async function main() {
  if (!isPwaEnabled(process.env)) {
    await writeFile(`${distDir}/${SW_FILENAME}`, selfUnregisteringWorker());
    console.log('[pwa] CV_PWA=false: no manifest; sw.js only unregisters an earlier worker.');
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
