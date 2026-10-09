import { useTranslation } from "react-i18next";
import { changeLanguage, LANGUAGES, type LanguageCode } from "@/i18n";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  return (
    <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span className="sr-only">{t("language")}</span>
      <select
        className="rounded-full border border-border bg-card px-3 py-1.5 text-foreground"
        value={i18n.language}
        onChange={(event) => changeLanguage(event.target.value as LanguageCode)}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </label>
  );
}
