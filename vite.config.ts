import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

/**
 * Build stamp. Baked into the bundle as `__APP_BUILD__` AND written to
 * `version.json` next to it, from the same value — so a running client can ask
 * the server "is the build you are serving still the one I am running?" and
 * offer a refresh when it isn't. See src/lib/appVersion.ts.
 *
 * A deploy's commit SHA is the ideal id (identical source ⇒ identical id, so a
 * re-run of the same deploy never nags anybody to refresh); the timestamp is
 * the local-build fallback.
 */
const BUILD_ID =
  process.env.GITHUB_SHA?.slice(0, 12) || `dev-${Math.floor(Date.now() / 1000).toString(36)}`;

function buildStamp(): Plugin {
  const body = JSON.stringify({ build: BUILD_ID }) + '\n';
  return {
    name: 'frycards-build-stamp',
    // The dev server has no emitted assets, so serve the same document from
    // memory — otherwise the update check 404s (and, worse, would read an
    // SPA's index.html fallback as a malformed version) every dev session.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0].endsWith('/version.json')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(body);
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: body });
    },
  };
}

export default defineConfig(() => {
  return {
    base: process.env.GITHUB_PAGES === 'true' ? '/frycards/' : '/',
    define: { __APP_BUILD__: JSON.stringify(BUILD_ID) },
    plugins: [react(), tailwindcss(), buildStamp()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
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
