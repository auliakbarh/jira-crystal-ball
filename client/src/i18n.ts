import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import id from "./locales/id.json";

// i18n setup (EN + ID). Strings live in locales/en.json + id.json, keyed by a
// per-page/component namespace. Language persists in localStorage ("jcb_lang").

const stored = typeof localStorage !== "undefined" ? localStorage.getItem("jcb_lang") : null;

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, id: { translation: id } },
  lng: stored || "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function setLanguage(lng: string) {
  localStorage.setItem("jcb_lang", lng);
  void i18n.changeLanguage(lng);
}

export default i18n;
