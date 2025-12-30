import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 300000, // 5 minutos por teste (Nova Act pode demorar)
    hookTimeout: 60000,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: 4,
        minThreads: 1,
      },
    },
    reporters: ['verbose', 'html'],
    outputFile: {
      html: './reports/test-report.html',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './reports/coverage',
    },
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./config/setup.ts'],
  },
  resolve: {
    alias: {
      '@': '.',
    },
  },
});
