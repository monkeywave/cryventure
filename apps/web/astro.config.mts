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
          items: [{ slug: 'foundations/welcome-lab' }],
        },
        {
          label: 'Block ciphers',
          translations: { de: 'Blockchiffren' },
          items: [
            {
              label: 'AES',
              translations: { de: 'AES' },
              items: [
                { slug: 'symmetric/aes' },
                { slug: 'symmetric/aes/subbytes-sbox' },
                { slug: 'symmetric/aes/shiftrows-mixcolumns' },
                { slug: 'symmetric/aes/key-expansion' },
                { slug: 'symmetric/aes/memory-and-hardware' },
              ],
            },
          ],
        },
      ],
      disable404Route: true,
      customCss: ['./src/styles/global.css'],
      components: {
        LanguageSelect: './src/overrides/LanguageSelect.astro',
      },
    }),
    react(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
