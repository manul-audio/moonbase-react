import { defineConfig } from 'vitest/config'

// Force the test environment regardless of the shell. A global
// NODE_ENV=production makes `react` resolve its production build, where
// `React.act` does not exist and @testing-library/react cannot render.
// The assignment fixes the config process (workers inherit its env); the
// `test.env` entry fixes any worker that re-reads the variable.
process.env.NODE_ENV = 'test'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    env: { NODE_ENV: 'test' },
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/live/**'],
  },
})
