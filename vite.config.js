import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Aura Music',
        short_name: 'Aura',
        description: 'Immersive ad-free music player',
        theme_color: '#0f0f13',
        background_color: '#0f0f13',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/vite.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: '/vite.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api/saavn': {
        target: 'https://saavn.sumit.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/saavn/, '/api'),
        secure: false,
      },
      '/api/yt': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
})
