import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ru from "./locales/ru.json";
import uzCyrl from "./locales/uz-Cyrl.json";
import uzLatn from "./locales/uz-Latn.json";

export const LANGUAGES = [
  { code: "uz-Latn", label: "O‘zbekcha" },
  { code: "uz-Cyrl", label: "Ўзбекча" },
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const STORAGE_KEY = "chizma.lang";

function readStoredLanguage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function detectLanguage(stored: string | null, browser: readonly string[]): LanguageCode {
  const known = LANGUAGES.map((l) => l.code) as readonly string[];
  if (stored && known.includes(stored)) return stored as LanguageCode;
  for (const tag of browser) {
    const lower = tag.toLowerCase();
    if (lower.startsWith("uz")) return lower.includes("cyrl") ? "uz-Cyrl" : "uz-Latn";
    if (lower.startsWith("ru")) return "ru";
    if (lower.startsWith("en")) return "en";
  }
  return "uz-Latn";
}

export function changeLanguage(code: LanguageCode): void {
  void i18n.changeLanguage(code);
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // storage may be unavailable (private mode); the choice simply won't persist
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru },
    "uz-Latn": { translation: uzLatn },
    "uz-Cyrl": { translation: uzCyrl },
  },
  lng: detectLanguage(
    readStoredLanguage(),
    typeof navigator === "undefined" ? [] : navigator.languages,
  ),
  fallbackLng: "ru",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  if (typeof document !== "undefined") document.documentElement.lang = lng;
});

export default i18n;
