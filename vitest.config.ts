import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
  },
  resolve: {
    // Allow vitest to resolve .js imports as .ts files (for tsc compat)
    extensions: ['.ts', '.tsx', '.js', '.json'],
  },
});
