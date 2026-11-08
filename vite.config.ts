import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Offline: a service worker (sw.js, a plain static file Vercel serves like any other) keeps the app itself,
// photos, map tiles and fonts on the phone. The family data (places, votes…) is saved by useData.ts.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate', // new deploys replace the old version quietly
      injectRegister: 'auto',
      manifest: {
        name: 'JapanFam', short_name: 'JapanFam', description: 'Our family Japan trip planner',
        theme_color: '#fbf7f0', background_color: '#fbf7f0', display: 'standalone', start_url: '/',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // the map bundle is ~800 kB
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          { // map style, vector tiles, map fonts + icons: show what you've already looked at
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'map', expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 45, purgeOnQuotaError: true }, cacheableResponse: { statuses: [0, 200] } },
          },
          { // place + hotel photos (any site)
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: { cacheName: 'photos', expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 45, purgeOnQuotaError: true }, cacheableResponse: { statuses: [0, 200] } },
          },
          { // Google fonts
            urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
})
