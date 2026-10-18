import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
    manifest: {
      name: 'PlugTime', short_name: 'PlugTime', description: 'Your personal charging log. Works offline.',
      start_url: '/', scope: '/', display: 'standalone', background_color: '#101c16', theme_color: '#1b2c24',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/cdn-cgi(?:\/|$)/],
      cleanupOutdatedCaches: true,
    },
  })],
});
