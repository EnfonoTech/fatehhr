import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { VitePWA } from "vite-plugin-pwa";
import { fatehhrThemePlugin } from "./plugins/vite-theme-plugin";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "CUSTOMER_");
  // Native bundles use relative paths; web builds deploy under Frappe's
  // /assets/fatehhr/spa/ static route (served from apps/fatehhr/fatehhr/public/spa/).
  const base = env.CUSTOMER_BUILD_TARGET === "native" ? "" : "/assets/fatehhr/spa/";

  return {
    base,
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    plugins: [
      vue(),
      fatehhrThemePlugin(env),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "auto",
        strategies: "generateSW",
        includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
        // Our theme plugin already emits manifest.json; skip VitePWA's manifest.
        manifest: false,
        workbox: {
          // Precache the SPA shell so cold-start offline works after one visit.
          globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
          // Never intercept Frappe API calls. Use network-first with short timeout
          // so SW is transparent to our queue+drain logic.
          navigateFallback: "index.html",
          navigateFallbackDenylist: [/^\/api/, /^\/files/, /^\/assets\/fatehhr\/(?!spa)/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts",
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
            {
              urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
              handler: "CacheFirst",
              options: {
                cacheName: "osm-tiles",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    server: {
      port: 5173,
      host: true,
      proxy: {
        "/api": {
          target: env.CUSTOMER_DEV_PROXY || "https://hr-demo.enfonoerp.com",
          changeOrigin: true,
          secure: true,
        },
        "/assets": {
          target: env.CUSTOMER_DEV_PROXY || "https://hr-demo.enfonoerp.com",
          changeOrigin: true,
          secure: true,
        },
        "/files": {
          target: env.CUSTOMER_DEV_PROXY || "https://hr-demo.enfonoerp.com",
          changeOrigin: true,
          secure: true,
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
    },
  };
});
