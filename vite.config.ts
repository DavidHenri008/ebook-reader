import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  // Keep assets relative so the web app can be hosted below the origin root.
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
      // Registration is performed explicitly in src/main.tsx.
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
