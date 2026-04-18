/// <reference types="vite/client" />

declare const __BUILD_TAG__: string;

declare module "virtual:fatehhr-theme" {
  export const CUSTOMER_ERP_DOMAIN: string;
  export const CUSTOMER_BRAND_NAME: string;
  export const CUSTOMER_PRIMARY_COLOR: string;
  export const CUSTOMER_LOCALE: "en" | "ar";
  export const CUSTOMER_SELFIE_MODE: "off" | "first" | "every";
  export const CUSTOMER_BUILD_TARGET: "web" | "native";
  export const ACCENT_TOKENS: {
    accent: string;
    accentStrong: string;
    accentSoft: string;
    accentInk: string;
    accentRing: string;
  };
}
