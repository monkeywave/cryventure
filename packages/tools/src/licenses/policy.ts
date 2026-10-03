/**
 * License policy for every installed dependency (docs/M4.md §9, `pnpm licenses:check`).
 * Each entry says why the license is acceptable for an Apache-2.0 static site that we also ship
 * as a Docker image. Anything not listed fails the check until someone reviews it.
 */

/** SPDX id → why it is allowed. */
export const ALLOWED_LICENSES: Readonly<Record<string, string>> = {
  MIT: 'Permissive; only requires keeping the copyright and permission notice.',
  'MIT-0': 'MIT without even the attribution requirement.',
  ISC: 'Permissive, functionally equivalent to MIT.',
  '0BSD': 'Public-domain-equivalent BSD variant without attribution requirement.',
  'BSD-2-Clause': 'Permissive; attribution only.',
  'BSD-3-Clause': 'Permissive; attribution plus no-endorsement clause.',
  'Apache-2.0': "Permissive with a patent grant; our own license, so NOTICE handling is already part of our process.",
  'BlueOak-1.0.0': 'Permissive (Blue Oak Model License); attribution only (npm tooling such as glob, lru-cache).',
  Unlicense: 'Public-domain dedication.',
  'CC0-1.0': 'Public-domain dedication (data packages such as mdn-data).',
  'CC-BY-4.0': 'Attribution-only license for data (caniuse-lite browser data); no copyleft.',
  'Python-2.0': 'PSF license (argparse port); permissive, attribution only, GPL-compatible.',
};

/**
 * Reviewed packages whose license is not on the allowlist. `name` matches exactly, or as a prefix when
 * it ends with `*` (platform-specific binaries differ per OS: darwin locally, linux/musl in CI and Docker).
 * When `pattern` is set it decides instead, and `name` only describes the match.
 */
export interface LicenseException {
  readonly name: string;
  readonly pattern?: RegExp;
  readonly license: string;
  readonly reason: string;
}

export const LICENSE_EXCEPTIONS: readonly LicenseException[] = [
  {
    name: '@img/sharp-libvips-*',
    license: 'LGPL-3.0-or-later',
    reason:
      'libvips binary loaded dynamically by sharp (Astro image service) at build time only; it is not part of the static site or the nginx runtime image, and we do not modify it.',
  },
  {
    name: 'lightningcss, lightningcss-<platform>',
    // lightningcss itself and its per-platform binaries (darwin-x64, linux-x64-musl, win32-arm64-msvc, …), nothing else.
    pattern: /^lightningcss(-(darwin|linux|win32|freebsd|android)-(x64|arm64|arm)(-(gnu|musl|msvc|gnueabihf))?)?$/,
    license: 'MPL-2.0',
    reason:
      'CSS minifier used by Vite at build time; its code is not shipped (only its output, our CSS). MPL-2.0 is file-level copyleft and we do not modify its files.',
  },
  {
    name: 'axe-core',
    license: 'MPL-2.0',
    reason: 'Accessibility engine injected by Playwright e2e tests only (dev dependency); never shipped.',
  },
  {
    name: '@axe-core/playwright',
    license: 'MPL-2.0',
    reason: 'Playwright adapter for axe-core, e2e tests only (dev dependency); never shipped.',
  },
];
