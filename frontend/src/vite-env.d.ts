/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** "false" to call the real /plan and /forecast; anything else serves the mocks. */
  readonly VITE_API_MOCK?: string;
}
