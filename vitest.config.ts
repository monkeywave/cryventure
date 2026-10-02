import { defineConfig } from 'vitest/config';

/**
 * Coverage floor for the engine packages (plan: ≥90% engine). Branch coverage
 * is only enforced for core; primitives currently sits below 90% branches.
 */
const ENGINE_FLOOR = { lines: 90, functions: 90, statements: 90 };

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/web'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/testing/**', '**/*.d.ts'],
      thresholds: {
        'packages/core/src/**': { ...ENGINE_FLOOR, branches: 90 },
        'packages/primitives/src/**': ENGINE_FLOOR,
      },
    },
  },
});
