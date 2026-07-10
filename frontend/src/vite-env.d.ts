/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_OAUTH_GOOGLE_CLIENT_ID: string;
  readonly VITE_PROXY_TARGET?: string;
  readonly VITE_ENABLE_PUSH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
