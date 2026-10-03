import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    'import.meta.env.VITE_USE_EMULATORS': JSON.stringify('true'),
    'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify('demo-peerly-collab'),
  },
  test: {
    environment: 'jsdom',
    clearMocks: true,
    pool: 'threads',
    maxWorkers: 1,
    fileParallelism: false,
  },
})
