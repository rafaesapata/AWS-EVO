import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
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
    // Only apply defines in production build — in dev mode, Vite's env.mjs
    // tries to assign to readonly properties (e.g. globalThis.crypto) causing errors
    ...(mode === 'production' ? {
      'global.crypto': 'globalThis.crypto',
      'import.meta.env.VITE_DEMO_EMAIL': JSON.stringify(env.VITE_DEMO_EMAIL || 'comercial+evo@uds.com.br'),
      'import.meta.env.VITE_DEMO_PASSWORD': JSON.stringify(env.VITE_DEMO_PASSWORD || 'Demoevouds@00!'),
    } : {}),
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
    
    rollupOptions: {
      output: {
        // Keep react + react-dom + react-router in the SAME chunk to prevent
        // TDZ errors ("Cannot access '_' before initialization") caused by
        // cross-chunk initialization order issues in Rollup.
        // See: https://github.com/vitejs/vite/discussions/9686
        manualChunks(id) {
          if (id.includes('node_modules/react-router-dom') || id.includes('node_modules/react-router/') ||
              id.includes('node_modules/react-dom/') || id.includes('node_modules/react/') ||
              id.includes('node_modules/scheduler/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@radix-ui/')) {
            return 'vendor-ui';
          }
          if (id.includes('node_modules/lucide-react') || id.includes('node_modules/date-fns') || id.includes('node_modules/clsx') || id.includes('node_modules/zod')) {
            return 'vendor-utils';
          }
          if (id.includes('node_modules/@aws-sdk/')) {
            return 'vendor-aws';
          }
          if (id.includes('node_modules/crypto-js') || id.includes('node_modules/dompurify') || id.includes('node_modules/validator')) {
            return 'vendor-security';
          }
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
    // Temporarily keep console.log for debugging
    drop: [], // mode === 'production' ? ['console', 'debugger'] : [],
    target: 'es2020',
    legalComments: 'none',
  },
  
  preview: {
    port: 4173,
    host: true,
  },
}});