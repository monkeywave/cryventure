import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

/** Deployment target (see docs/PLAN.md §7b): Pages sets CV_BASE=/<repo>/, Docker uses `/`. */
const site = process.env.CV_SITE ?? 'https://example.github.io';
const base = process.env.CV_BASE ?? '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    starlight({
      title: { en: 'CryVenture', de: 'CryVenture' },
      description: 'Explore cryptography. Build understanding.',
      defaultLocale: 'en',
      locales: {
        en: { label: 'English', lang: 'en' },
        de: { label: 'Deutsch', lang: 'de' },
      },
      sidebar: [
        {
          label: 'Foundations',
          translations: { de: 'Grundlagen' },
          // Page order comes from each page's frontmatter `sidebar.order` (EN and DE).
          items: [{ autogenerate: { directory: 'foundations' } }],
        },
        {
          label: 'Block ciphers',
          translations: { de: 'Blockchiffren' },
          items: [
            {
              label: 'AES',
              translations: { de: 'AES' },
              // Page order comes from each page's frontmatter `sidebar.order` (EN and DE).
              items: [{ autogenerate: { directory: 'symmetric/aes' } }],
            },
            {
              label: 'Modes',
              translations: { de: 'Betriebsmodi' },
              // Page order comes from each page's frontmatter `sidebar.order` (EN and DE).
              items: [{ autogenerate: { directory: 'symmetric/modes' } }],
            },
          ],
        },
        {
          label: 'Hash functions',
          translations: { de: 'Hashfunktionen' },
          // Page order comes from each page's frontmatter `sidebar.order` (EN and DE).
          items: [{ autogenerate: { directory: 'hash' } }],
        },
        {
          label: 'MACs',
          translations: { de: 'MACs' },
          // Page order comes from each page's frontmatter `sidebar.order` (EN and DE): index, hmac, kmac.
          items: [{ autogenerate: { directory: 'mac' } }],
        },
        {
          label: 'Key derivation',
          translations: { de: 'Schlüsselableitung' },
          // Page order comes from each page's frontmatter `sidebar.order` (EN and DE): hkdf, pbkdf2, tls-prf.
          items: [{ autogenerate: { directory: 'kdf' } }],
        },
        // Starlight prefixes a `link` with the current locale and the base (`/cryventure/de/progress/`).
        { label: 'Your progress', translations: { de: 'Dein Fortschritt' }, link: '/progress/' },
      ],
      disable404Route: true,
      customCss: ['./src/styles/global.css'],
      components: {
        Head: './src/overrides/Head.astro',
        LanguageSelect: './src/overrides/LanguageSelect.astro',
        ThemeSelect: './src/overrides/ThemeSelect.astro',
      },
    }),
    react(),
  ],
  vite: {
    plugins: [tailwindcss()],
    // Module workers (lab producers, PenguinLab) code-split like the page bundles.
    worker: { format: 'es' },
  },
});
