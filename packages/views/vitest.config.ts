import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'views',
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['@cryventure/viz/testing/setup'],
    // The derivation stylesheet is processed (others stay stubbed) so tests can assert its wrap/scroll styles.
    css: { include: [/\/derivation\.css$/] },
  },
});
