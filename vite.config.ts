import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  
  define: {
    global: 'globalThis',
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
    
    rollupOptions: {
      output: {
        // Chunk splitting with AWS SDK
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['@radix-ui/react-tabs', '@radix-ui/react-slot', '@radix-ui/react-toast'],
          'vendor-utils': ['lucide-react', 'date-fns', 'clsx', 'zod'],
          'vendor-aws': ['@aws-sdk/client-cognito-identity-provider', '@aws-sdk/client-bedrock-runtime'],
          'vendor-security': ['crypto-js', 'dompurify', 'validator'],
        },
      },
    },
    
    minify: 'esbuild',
    sourcemap: mode === 'development',
    cssCodeSplit: true,
    assetsInlineLimit: 4096,
  },
  
  // Dependency optimization
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      'lucide-react',
      'date-fns',
      'clsx',
      'zod',
      'crypto-js',
      'dompurify',
      'validator',
      '@aws-sdk/client-cognito-identity-provider',
      '@aws-sdk/client-bedrock-runtime'
    ],
    exclude: [
      '@aws-sdk/util-utf8-browser',
      '@aws-crypto/sha256-js',
      '@aws-crypto/util'
    ],
  },
  
  css: {
    devSourcemap: mode === 'development',
  },
  
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
    target: 'es2020',
    legalComments: 'none',
  },
  
  preview: {
    port: 4173,
    host: true,
  },
}));