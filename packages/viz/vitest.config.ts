import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'viz',
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/testing/setup.ts'],
  },
});
