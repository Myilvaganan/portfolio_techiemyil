/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RESUME_API_URL: string
  readonly VITE_SEND_EMAIL_API_URL: string
  readonly VITE_MYVA_API_URL: string
  readonly VITE_VISIT_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
