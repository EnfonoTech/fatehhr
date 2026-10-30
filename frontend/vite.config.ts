import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { VitePWA } from "vite-plugin-pwa";
import { fatehhrThemePlugin } from "./plugins/vite-theme-plugin";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "CUSTOMER_");
  const base = env.CUSTOMER_BUILD_TARGET === "native" ? "" : "/assets/fatehhr/spa/";

  // Build-time version tag. Shown in-app so users can confirm they got the
  // latest JS. Format: YYMMDD-HHMM
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const BUILD_TAG =
    now.getUTCFullYear().toString().slice(-2) +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    "-" +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes());

  const bundleVersionFile = {
    name: "fatehhr-bundle-version",
    generateBundle(this: { emitFile: (f: object) => void }) {
      this.emitFile({ type: "asset", fileName: "bundle-version.txt", source: BUILD_TAG.replace("-", "") });
    },
  };

  return {
    base,
    define: {
      __BUILD_TAG__: JSON.stringify(BUILD_TAG),
      // live update (src/app/live-update.ts): the same tag as a sortable number
      __BUNDLE_VERSION__: JSON.stringify(BUILD_TAG.replace("-", "")),
    },
    resolve: {
      alias: { "@": path.resolve(__dirname, "src") },
      // `vue-tsc -b` (the build script) emits a gitignored .js next to every
      // .ts in src/. Vite's default order tries .js BEFORE .ts, so a stale
      // emitted file silently shadows the edited source (dev, vitest, and any
      // build not preceded by vue-tsc -b). Prefer TypeScript sources.
      extensions: [".mjs", ".mts", ".ts", ".tsx", ".js", ".jsx", ".json"],
    },
    plugins: [
      vue(),
      fatehhrThemePlugin(env),
      bundleVersionFile,
      VitePWA({
        // Native APK: the screens are local files (and live-updated, src/app/live-update.ts); a
        // service worker would serve old cached screens over new ones, so native builds ship one
        // that removes itself (and the one older APKs installed).
        selfDestroying: env.CUSTOMER_BUILD_TARGET === "native",
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
