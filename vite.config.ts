import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon/favicon.ico', 'favicon/favicon.svg', 'favicon/apple-touch-icon.png'],
      manifest: {
        name: 'Myilvaganan Sakthivel — Techie Myil',
        short_name: 'Techie Myil',
        description:
          'Portfolio of Myilvaganan Sakthivel — Senior Software Engineer & Technical Lead building scalable, AI-integrated systems.',
        start_url: '/admin',
        scope: '/',
        shortcuts: [
          { name: 'Admin', url: '/admin', icons: [{ src: '/favicon/web-app-manifest-192x192.png', sizes: '192x192' }] },
          { name: 'Portfolio', url: '/', icons: [{ src: '/favicon/web-app-manifest-192x192.png', sizes: '192x192' }] },
        ],
        display: 'standalone',
        theme_color: '#0a0612',
        background_color: '#0a0612',
        icons: [
          { src: '/favicon/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/favicon/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/favicon/maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        orientation: 'portrait-primary',
        categories: ['portfolio', 'productivity'],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg,woff,woff2}'],
        navigateFallbackDenylist: [/^\/resume\//],
        // Read-only offline mode: the last successful answers for vault data are kept for a week and used when the network fails.
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) => request.method === 'GET' && /\.execute-api\.[^.]+\.amazonaws\.com$/.test(url.hostname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'vault-api',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 120, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
})
