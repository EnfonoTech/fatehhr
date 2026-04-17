import { CUSTOMER_ERP_DOMAIN, CUSTOMER_BUILD_TARGET } from "virtual:fatehhr-theme";

export function isNative(): boolean {
  if (CUSTOMER_BUILD_TARGET === "native") return true;
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function API_BASE(): string {
  if (isNative()) return `https://${CUSTOMER_ERP_DOMAIN}`;
  return ""; // same-origin on web (via Vite proxy in dev, reverse-proxy in prod)
}
