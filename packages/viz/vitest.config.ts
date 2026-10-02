import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'viz',
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/testing/setup.ts'],
    // The shared stylesheet is processed (others stay stubbed) so tests can assert computed layout styles.
    css: { include: [/\/viz\.css$/] },
  },
});
