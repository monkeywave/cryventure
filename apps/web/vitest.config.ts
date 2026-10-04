import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'web',
    environment: 'node',
    // e2e/helpers hold pure helpers (e.g. contrast math) with unit tests; Playwright runs only *.spec.ts.
    include: ['src/**/*.test.{ts,tsx}', 'e2e/helpers/**/*.test.ts', 'scripts/**/*.test.ts'],
    // The lab chrome stylesheet is processed (others stay stubbed) so tests can assert its computed styles.
    css: { include: [/\/styles\/lab\.css$/] },
  },
});
