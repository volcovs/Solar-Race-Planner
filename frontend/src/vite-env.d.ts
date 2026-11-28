/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** "false" to call the real /plan and /forecast; anything else serves the mocks. */
  readonly VITE_API_MOCK?: string;
  /** The source repository (Contact links); defaults to the project's own. */
  readonly VITE_REPO_URL?: string;
}

/** ISO 8601 date of the last commit, set by vite.config.ts. */
declare const __LAST_UPDATE__: string;
