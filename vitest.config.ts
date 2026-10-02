import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/web'],
    coverage: { provider: 'v8', include: ['packages/*/src/**'] },
  },
});
