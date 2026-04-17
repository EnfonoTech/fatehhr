import { createI18n } from "vue-i18n";
import en from "@/locales/en.json";
import ar from "@/locales/ar.json";
import { CUSTOMER_LOCALE } from "virtual:fatehhr-theme";

const stored = typeof localStorage !== "undefined"
  ? localStorage.getItem("fatehhr.locale")
  : null;

export const appI18n = createI18n({
  legacy: false,
  locale: (stored as "en" | "ar") || (CUSTOMER_LOCALE as "en" | "ar") || "en",
  fallbackLocale: "en",
  messages: { en, ar },
});

export function setLocale(locale: "en" | "ar") {
  appI18n.global.locale.value = locale;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  localStorage.setItem("fatehhr.locale", locale);
}
