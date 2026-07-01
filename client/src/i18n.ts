import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Lightweight i18n setup. Language persists in localStorage ("jcb_lang").
// Currently EN + ID; nav / common UI + the Help page are translated. Other
// page bodies are English for now — wrap their strings in t() to extend.

const en = {
  nav: {
    current: "Current Sprint",
    board: "Board",
    clairvoyance: "Clairvoyance",
    tarot: "Tarot",
    previous: "Previous Sprints",
    velocity: "Velocity",
    settings: "Settings",
    help: "Help",
  },
  common: {
    guest: "Guest",
    logout: "Logout",
    newSquad: "New squad…",
    createSquad: "Create squad",
    noSquads: "No squads",
    noSquadSelected: "No squad selected. Create one above to begin.",
    toggleTheme: "Toggle theme",
    language: "Language",
    footer: "🔮 JIRA Crystal Ball · Created by Aulia Akbar Harahap · June 2026",
  },
  help: {
    heading: "❓ How to use the dashboard",
    subtitle: "A quick guide to running standups with JIRA Crystal Ball.",
  },
};

const id: typeof en = {
  nav: {
    current: "Sprint Aktif",
    board: "Papan",
    clairvoyance: "Clairvoyance",
    tarot: "Tarot",
    previous: "Sprint Sebelumnya",
    velocity: "Velocity",
    settings: "Pengaturan",
    help: "Bantuan",
  },
  common: {
    guest: "Tamu",
    logout: "Keluar",
    newSquad: "Squad baru…",
    createSquad: "Buat squad",
    noSquads: "Belum ada squad",
    noSquadSelected: "Belum ada squad dipilih. Buat satu di atas untuk mulai.",
    toggleTheme: "Ganti tema",
    language: "Bahasa",
    footer: "🔮 JIRA Crystal Ball · Dibuat oleh Aulia Akbar Harahap · Juni 2026",
  },
  help: {
    heading: "❓ Cara memakai dashboard",
    subtitle: "Panduan singkat menjalankan standup dengan JIRA Crystal Ball.",
  },
};

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
