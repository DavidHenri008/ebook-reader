import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  // Relative base so assets resolve under the native Capacitor scheme as well as
  // the web origin. The web PWA (served from "/") works with relative URLs too.
  base: "./",
  plugins: [
    react({
      jsxImportSource: "@emotion/react",
      plugins: [
        [
          "@swc/plugin-emotion",
          {
            autoLabel: "dev-only",
            labelFormat: "[local]",
          },
        ],
      ],
    }),
    VitePWA({
      registerType: "autoUpdate",
      // Registration is performed manually in src/main.tsx so it can be gated to
      // non-native platforms (the service worker is redundant inside Capacitor).
      injectRegister: false,
      includeAssets: ["favicon.svg", "icons/*.svg"],
      manifest: {
        name: "EPUB Reader",
        short_name: "Reader",
        description: "Google Drive EPUB reader",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: ".",
        icons: [
          {
            src: "icons/icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
          },
          {
            src: "icons/icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
          },
          {
            src: "icons/icon-512.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Cache the static app shell only. Google API responses, OAuth tokens,
        // Picker frames, and user EPUB content are never runtime-cached here.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "index.html",
        runtimeCaching: [],
      },
    }),
  ],
});
