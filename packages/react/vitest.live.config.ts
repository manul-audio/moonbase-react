import { defineConfig } from 'vitest/config'

// Live tests talk to a real Moonbase tenant from Node. No DOM, longer timeouts.
process.env.NODE_ENV = 'test'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/live/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    env: { NODE_ENV: 'test' },
  },
})
