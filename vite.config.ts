import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

if (process.env.CAPACITOR_BUILD_TYPE === 'debug' && process.env.VITE_DEBUG_APK === undefined) {
  process.env.VITE_DEBUG_APK = 'true'
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
