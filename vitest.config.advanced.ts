/**
 * Advanced Vitest Configuration
 * Comprehensive testing setup with coverage, performance monitoring, and reporting
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Test Environment
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup/test-environment.ts'],
    
    // Global Configuration
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    
    // Test Discovery
    include: [
      'src/tests/**/*.test.{ts,tsx}',
      'src/**/__tests__/**/*.{ts,tsx}',
      'src/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: [
      'node_modules',
      'dist',
      'build',
      '.next',
      'coverage',
    ],
    
    // Performance and Timeouts
    testTimeout: 10000, // 10 seconds per test
    hookTimeout: 10000, // 10 seconds for hooks
    teardownTimeout: 5000, // 5 seconds for cleanup
    
    // Parallel Execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
        useAtomics: true,
      },
    },
    
    // Coverage Configuration
    coverage: {
      provider: 'v8',
      reporter: [
        'text',
        'text-summary',
        'html',
        'json',
        'json-summary',
        'lcov',
        'clover',
      ],
      reportsDirectory: './coverage',
      
      // Coverage Thresholds
      thresholds: {
        global: {
          statements: 80,
          branches: 75,
          functions: 80,
          lines: 80,
        },
        // Per-file thresholds
        './src/integrations/aws/': {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        './src/hooks/': {
          statements: 85,
          branches: 80,
          functions: 85,
          lines: 85,
        },
      },
      
      // Include/Exclude patterns
      include: [
        'src/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'src/tests/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'node_modules',
      ],
      
      // Advanced Coverage Options
      all: true,
      skipFull: false,
      clean: true,
      cleanOnRerun: true,
    },
    
    // Reporting
    reporter: [
      'default',
      'verbose',
      'json',
      'html',
      'junit',
    ],
    outputFile: {
      json: './test-results/results.json',
      html: './test-results/report.html',
      junit: './test-results/junit.xml',
    },
    
    // Watch Mode
    watch: false, // Disabled for CI/CD
    watchExclude: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'test-results/**',
    ],
    
    // Performance Monitoring
    logHeapUsage: true,
    
    // Advanced Options
    isolate: true,
    passWithNoTests: false,
    allowOnly: false, // Prevent .only in CI
    dangerouslyIgnoreUnhandledErrors: false,
    
    // Custom Matchers and Extensions
    expect: {
      // Add custom matchers if needed
    },
    
    // Environment Variables for Testing
    env: {
      NODE_ENV: 'test',
      VITE_AWS_REGION: 'us-east-1',
      VITE_AWS_USER_POOL_ID: 'test-pool-id',
      VITE_AWS_USER_POOL_CLIENT_ID: 'test-client-id',
      VITE_API_BASE_URL: 'https://test-api.example.com',
    },
    
    // Retry Configuration
    retry: 2, // Retry failed tests twice
    
    // Sequence Configuration
    sequence: {
      concurrent: true,
      shuffle: false, // Keep deterministic order
      hooks: 'parallel',
    },
    
    // Browser Testing (if needed)
    // browser: {
    //   enabled: false,
    //   name: 'chromium',
    //   provider: 'playwright',
    //   headless: true,
    // },
  },
  
  // Build Configuration for Tests
  esbuild: {
    target: 'node14',
  },
  
  // Define Global Constants
  define: {
    __TEST__: true,
    __DEV__: false,
    __PROD__: false,
  },
});