/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Starting colour palette for this deployment: "classic" (default) or "brass". */
  readonly VITE_DEFAULT_PALETTE?: string;
}
