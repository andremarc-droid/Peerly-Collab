import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.peerly.collab',
  appName: 'Peerly Collab',
  // Vite writes the production build here (npm run build).
  webDir: 'dist',
  android: {
    // Keeps the in-app origin on https so Firebase and secure-context APIs work.
    allowMixedContent: false,
  },
}

export default config
