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
    // Explicitly define demo credentials to prevent tree-shaking
    'import.meta.env.VITE_DEMO_EMAIL': JSON.stringify(env.VITE_DEMO_EMAIL || 'comercial+evo@uds.com.br'),
    'import.meta.env.VITE_DEMO_PASSWORD': JSON.stringify(env.VITE_DEMO_PASSWORD || 'Demoevouds@00!'),
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