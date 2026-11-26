import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'icons/fokustrack-192.png',
        'icons/fokustrack-512.png',
        'icons/fokustrack-maskable.png'
      ],
      manifest: {
        id: '/',
        name: 'FokusTrack — Fokus, Jadwal, Pengingat & Keuangan',
        short_name: 'FokusTrack',
        description: 'Aplikasi produktivitas pribadi dengan timer fokus, pengingat jadwal Web Push, streak konsistensi, dan dompet harian.',
        lang: 'id-ID',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        theme_color: '#0b0e14',
        background_color: '#0b0e14',
        categories: ['productivity', 'finance', 'utilities'],
        icons: [
          { src: '/icons/fokustrack-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/fokustrack-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/fokustrack-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          {
            name: 'Beranda Hari Ini',
            short_name: 'Beranda',
            url: '/?tab=today',
            icons: [{ src: '/icons/fokustrack-192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: 'Mulai Sesi Fokus',
            short_name: 'Fokus',
            url: '/?tab=focus',
            icons: [{ src: '/icons/fokustrack-192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: 'Kalender & Pengingat',
            short_name: 'Kalender',
            url: '/?tab=calendar',
            icons: [{ src: '/icons/fokustrack-192.png', sizes: '192x192', type: 'image/png' }]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        importScripts: ['/push-handler.js']
      },
      devOptions: { enabled: false }
    })
  ],
})
