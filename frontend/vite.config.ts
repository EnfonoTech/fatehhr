import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { fatehhrThemePlugin } from "./plugins/vite-theme-plugin";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "CUSTOMER_");
  const base = env.CUSTOMER_BUILD_TARGET === "native" ? "" : "/fatehhr/";

  return {
    base,
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    plugins: [vue(), fatehhrThemePlugin(env)],
    server: {
      port: 5173,
      host: true,
      proxy: {
        "/api": {
          target: env.CUSTOMER_DEV_PROXY || "http://94.136.186.151",
          changeOrigin: false,
          secure: false,
          configure(proxy) {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("Host", "fatehhr_dev");
              proxyReq.setHeader("X-Frappe-Site-Name", "fatehhr_dev");
            });
          },
        },
        "/assets": {
          target: env.CUSTOMER_DEV_PROXY || "http://94.136.186.151",
          changeOrigin: false,
          secure: false,
          configure(proxy) {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("Host", "fatehhr_dev");
            });
          },
        },
        "/files": {
          target: env.CUSTOMER_DEV_PROXY || "http://94.136.186.151",
          changeOrigin: false,
          secure: false,
          configure(proxy) {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("Host", "fatehhr_dev");
            });
          },
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
    },
  };
});
