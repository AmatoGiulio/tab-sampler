import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only this project's tests: local tool worktrees keep their own copies.
    include: ['tests/**/*.test.ts'],
  },
});
