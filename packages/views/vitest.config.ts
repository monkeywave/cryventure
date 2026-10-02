import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'views',
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['@cryventure/viz/testing/setup'],
  },
});
