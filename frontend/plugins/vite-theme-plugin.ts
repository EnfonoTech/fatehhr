import type { Plugin } from "vite";
import { deriveAccentTokens } from "./theme-utils";

interface CustomerEnv {
  CUSTOMER_ERP_DOMAIN?: string;
  CUSTOMER_BRAND_NAME?: string;
  CUSTOMER_PRIMARY_COLOR?: string;
  CUSTOMER_LOCALE?: string;
  CUSTOMER_SELFIE_MODE?: string;
  CUSTOMER_BUILD_TARGET?: string;
}

export function fatehhrThemePlugin(env: CustomerEnv): Plugin {
  const accent = env.CUSTOMER_PRIMARY_COLOR ?? "#2E5D5A";
  const brand = env.CUSTOMER_BRAND_NAME ?? "Fateh HR";
  const tokens = deriveAccentTokens(accent);

  return {
    name: "fatehhr-theme-plugin",
    transformIndexHtml(html) {
      return html
        .replace(/__THEME_COLOR__/g, tokens.accent)
        .replace(/__BRAND_NAME__/g, brand);
    },
    resolveId(id) {
      if (id === "virtual:fatehhr-theme") return "\0virtual:fatehhr-theme";
      return null;
    },
    load(id) {
      if (id !== "\0virtual:fatehhr-theme") return null;
      return `
        export const CUSTOMER_ERP_DOMAIN = ${JSON.stringify(env.CUSTOMER_ERP_DOMAIN ?? "")};
        export const CUSTOMER_BRAND_NAME = ${JSON.stringify(brand)};
        export const CUSTOMER_PRIMARY_COLOR = ${JSON.stringify(tokens.accent)};
        export const CUSTOMER_LOCALE = ${JSON.stringify(env.CUSTOMER_LOCALE ?? "en")};
        export const CUSTOMER_SELFIE_MODE = ${JSON.stringify(env.CUSTOMER_SELFIE_MODE ?? "off")};
        export const CUSTOMER_BUILD_TARGET = ${JSON.stringify(env.CUSTOMER_BUILD_TARGET ?? "web")};
        export const ACCENT_TOKENS = ${JSON.stringify(tokens)};
      `;
    },
    transform(code, id) {
      if (!id.endsWith("tokens.css")) return null;
      return (
        code +
        `\n:root {\n  --accent: ${tokens.accent};\n  --accent-strong: ${tokens.accentStrong};\n  --accent-soft: ${tokens.accentSoft};\n  --accent-ink: ${tokens.accentInk};\n  --accent-ring: ${tokens.accentRing};\n}\n`
      );
    },
    generateBundle() {
      const manifest = {
        name: brand,
        short_name: brand.length > 12 ? brand.slice(0, 12) : brand,
        start_url: "/assets/fatehhr/spa/index.html",
        display: "standalone",
        background_color: "#FAF7F2",
        theme_color: tokens.accent,
        icons: [
          { src: "/assets/fatehhr/spa/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/assets/fatehhr/spa/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      };
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: JSON.stringify(manifest, null, 2),
      });
    },
  };
}
