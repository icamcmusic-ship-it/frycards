/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Public base URL the card art is served from, with no trailing slash — the
   * storage bucket's public base, or a CDN in front of it. Set for real
   * deploys in .github/workflows/deploy-pages.yml. Unset until
   * `scripts/migrate-art.ts` has run, in which case every image resolves to
   * the stored master instead — see `src/lib/media.ts`.
   */
  readonly VITE_ART_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
