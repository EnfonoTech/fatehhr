import { CUSTOMER_ERP_DOMAIN, CUSTOMER_BUILD_TARGET } from "virtual:fatehhr-theme";
export function isNative() {
    if (CUSTOMER_BUILD_TARGET === "native")
        return true;
    if (typeof window === "undefined")
        return false;
    const cap = window.Capacitor;
    return Boolean(cap?.isNativePlatform?.());
}
export function API_BASE() {
    if (isNative())
        return `https://${CUSTOMER_ERP_DOMAIN}`;
    return ""; // same-origin on web (via Vite proxy in dev, reverse-proxy in prod)
}
