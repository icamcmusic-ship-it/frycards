import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: process.env.GITHUB_PAGES === 'true' ? '/frycards/' : '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Finding 2.1: route-level lazy() splits the screens; this keeps the
          // framework and the card catalog out of the entry chunk so they cache
          // independently of app code. Everything else falls out of the lazy
          // boundaries in App.tsx.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('/motion') || id.includes('framer-motion')) return 'motion';
            if (id.includes('/react-dom') || id.includes('/react/') || id.includes('/scheduler'))
              return 'react';
            return 'vendor';
          },
        },
      },
    },
    server: {
      // HMR/file watching can be disabled via DISABLE_HMR to save CPU in
      // agent-driven editing sessions.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
