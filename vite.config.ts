import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, type HtmlTagDescriptor, type Plugin } from 'vite';

/**
 * Head hints that need build-time knowledge: preload the two upright latin
 * font files (their hashed names exist only after bundling) so text paints in
 * the real face instead of swapping late, and preconnect to the origins the
 * first requests go to (the API, and the art host when one is configured).
 */
function headHints(env: Record<string, string>): Plugin {
  const origin = (u: string) => {
    try {
      return new URL(u).origin;
    } catch {
      return null;
    }
  };
  return {
    name: 'fry-head-hints',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const base = ctx.server ? '/' : ctx.bundle ? env.BASE_URL || '/' : '/';
        const tags: HtmlTagDescriptor[] = [];
        for (const o of [
          origin(env.VITE_SUPABASE_URL || 'https://dnngihsbqxccqvvedvjc.supabase.co'),
          origin(env.VITE_ART_BASE_URL || ''),
        ]) {
          if (o)
            tags.push({
              tag: 'link',
              attrs: { rel: 'preconnect', href: o, crossorigin: '' },
              injectTo: 'head',
            });
        }
        for (const name of Object.keys(ctx.bundle ?? {})) {
          if (!/(^|\/)(montserrat|space-grotesk)-latin-(?!ext)[^/]*\.woff2$/.test(name)) continue;
          tags.push({
            tag: 'link',
            attrs: {
              rel: 'preload',
              as: 'font',
              type: 'font/woff2',
              crossorigin: '',
              href: base + name,
            },
            injectTo: 'head',
          });
        }
        return tags;
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, process.cwd(), 'VITE_'),
    BASE_URL: process.env.GITHUB_PAGES === 'true' ? '/frycards/' : '/',
  };
  return {
    base: process.env.GITHUB_PAGES === 'true' ? '/frycards/' : '/',
    plugins: [react(), tailwindcss(), headHints(env)],
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
    test: {
      // Finding (Robustness): 480 tests, all pure logic, zero DOM — ~20,000
      // lines of React were covered only by Playwright geometry sweeps that
      // check for overflow and console errors, not behaviour. A shed-picker
      // showing the wrong cards, a target selector picking the wrong unit or a
      // reward screen rendering a stale value were all uncatchable.
      //
      // Per-file environment: the engine/AI suites stay in the default (fast)
      // node environment; each `.test.tsx` opts into jsdom with a
      // `@vitest-environment jsdom` docblock, so only the DOM suites pay for
      // it.
      environment: 'node',
    },
    server: {
      // HMR/file watching can be disabled via DISABLE_HMR to save CPU in
      // agent-driven editing sessions.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
