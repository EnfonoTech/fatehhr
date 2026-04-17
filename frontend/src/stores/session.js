import { defineStore } from "pinia";
import { secureGet, secureSet, secureRemove } from "@/app/frappe";
const KEY_USER = "fatehhr.user";
const KEY_API_KEY = "fatehhr.api_key";
const KEY_API_SECRET = "fatehhr.api_secret";
const KEY_PIN_PRESENT = "fatehhr.pin_present";
const KEY_PIN_HASH = "fatehhr.pin_hash_local";
async function clientHashPin(pin, salt) {
    const enc = new TextEncoder().encode(`${salt}:${pin}`);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
export const useSessionStore = defineStore("session", {
    state: () => ({
        user: null,
        apiKey: null,
        apiSecret: null,
        requirePinSetup: false,
        isPinVerified: false,
        hydrated: false,
        lastActivityAt: Date.now(),
    }),
    getters: {
        hasApiSecret: (s) => Boolean(s.apiKey && s.apiSecret),
    },
    actions: {
        async hydrate() {
            if (this.hydrated)
                return;
            this.user = await secureGet(KEY_USER);
            this.apiKey = await secureGet(KEY_API_KEY);
            this.apiSecret = await secureGet(KEY_API_SECRET);
            const pinPresent = await secureGet(KEY_PIN_PRESENT);
            this.requirePinSetup = pinPresent !== "1";
            this.hydrated = true;
        },
        async applyLogin(p) {
            this.user = p.user;
            this.apiKey = p.api_key;
            this.apiSecret = p.api_secret;
            this.requirePinSetup = p.require_pin_setup;
            this.isPinVerified = !p.require_pin_setup;
            await secureSet(KEY_USER, p.user);
            await secureSet(KEY_API_KEY, p.api_key);
            await secureSet(KEY_API_SECRET, p.api_secret);
            await secureSet(KEY_PIN_PRESENT, p.require_pin_setup ? "0" : "1");
        },
        markPinVerified() {
            this.isPinVerified = true;
            this.lastActivityAt = Date.now();
        },
        async clear() {
            this.user = null;
            this.apiKey = null;
            this.apiSecret = null;
            this.requirePinSetup = false;
            this.isPinVerified = false;
            await secureRemove(KEY_USER);
            await secureRemove(KEY_API_KEY);
            await secureRemove(KEY_API_SECRET);
            await secureRemove(KEY_PIN_PRESENT);
            await secureRemove(KEY_PIN_HASH);
        },
        // Offline PIN (frappe-vue-pwa §5.5) — cache a separate client-side hash
        async cachePinHash(pin) {
            const hash = await clientHashPin(pin, this.apiSecret ?? "default-salt");
            await secureSet(KEY_PIN_HASH, hash);
        },
        async verifyPinLocally(pin) {
            const stored = await secureGet(KEY_PIN_HASH);
            if (!stored)
                return false;
            const hash = await clientHashPin(pin, this.apiSecret ?? "default-salt");
            return hash === stored;
        },
        bumpActivity() {
            this.lastActivityAt = Date.now();
        },
        shouldReprompt() {
            if (!this.hasApiSecret)
                return false;
            return Date.now() - this.lastActivityAt > 15 * 60 * 1000;
        },
    },
});
