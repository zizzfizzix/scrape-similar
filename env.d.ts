// Vite types every other `import.meta.env` key as `any`.
interface ImportMetaEnv {
  readonly VITE_PUBLIC_POSTHOG_KEY?: string
  readonly VITE_PUBLIC_POSTHOG_HOST?: string
}
