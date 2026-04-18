import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Per-customer overrides flow in via environment variables at build time.
 * The `scripts/build-customer.sh` wrapper runs `cap copy android` after
 * setting APP_ID_ANDROID + CUSTOMER_BRAND_NAME per customer.
 */
const config: CapacitorConfig = {
  appId: process.env.APP_ID_ANDROID || "com.enfono.fatehhr",
  appName: process.env.CUSTOMER_BRAND_NAME || "Fateh HR",
  // Native bundle: served straight from the APK's assets/, NOT from the Frappe server.
  // The built web dist is copied here by `pnpm -F fatehhr-frontend build` + `cap copy`.
  webDir: "../frontend/dist",
  server: {
    androidScheme: "https",
    // cleartext only needed if a customer's ERP is on plain HTTP during dev
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    // Backgrounded webviews stop timers on some OEMs; keep alive so the
    // drain scheduler can fire when net flips on.
    webContentsDebuggingEnabled: process.env.NODE_ENV !== "production",
  },
  plugins: {
    Camera: {
      androidSaveToGallery: false,
    },
    Geolocation: {
      // We ask at tap time, not on first launch — CheckinView handles the ask.
    },
  },
};

export default config;
