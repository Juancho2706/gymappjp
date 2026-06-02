import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    // Playwright specs live under tests/*.spec.ts — exclude them from Vitest.
    include: ['apps/web/src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}', 'packages/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    alias: {
      '@': path.resolve(__dirname, './apps/web/src'),
      '@eva/brand-kit': path.resolve(__dirname, './packages/brand-kit/index.ts'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
})
