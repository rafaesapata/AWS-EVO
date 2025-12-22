import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/handlers/**/*.ts'],
  format: ['esm'],
  target: 'node20',
  splitting: false,
  sourcemap: true,
  clean: true,
  bundle: true,
  minify: true,
  external: ['@aws-sdk/*', 'pg-native'],
  esbuildOptions(options) {
    options.mainFields = ['module', 'main'];
  },
});
