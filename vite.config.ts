import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "android-chrome-192x192.png", "android-chrome-512x512.png", "the-talent-app-icon.png"],
      manifest: {
        name: "The Talent App",
        short_name: "Talent App",
        description: "Recruitment pipeline and talent management",
        theme_color: "#D64541",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webmanifest}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/],
        // Hashed /assets/*.js must not use StaleWhileRevalidate — it kept serving
        // pre-fix bundles (old pipeline tab-count queries) after deploy.
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
