import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'primitives',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
