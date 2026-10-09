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
  plugins: {
    FirebaseAuthentication: {
      // Keep the Firebase JS SDK as the source of truth for React auth state.
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
}

export default config
