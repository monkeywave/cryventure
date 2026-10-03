import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'derivers',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
