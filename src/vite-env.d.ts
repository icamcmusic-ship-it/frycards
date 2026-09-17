/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Public base URL the card art is served from (the R2 bucket or the custom
   * domain in front of it), with no trailing slash. Unset until
   * `scripts/migrate-art-to-r2.ts` has run, in which case the catalog still
   * points at Supabase and every image is served at full size — see
   * `src/lib/media.ts`.
   */
  readonly VITE_ART_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
