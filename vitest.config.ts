import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // All three of the suites that matter are here as of milestone 5; the flag
    // stays so a fresh clone of an earlier tag still runs.
    passWithNoTests: true,
  },
});
