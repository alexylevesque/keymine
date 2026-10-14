"use client";

import { useLanguage, type SiteLang } from "@/lib/i18n";

/** Sélecteur de langue (I18N-02), présent dans l'en-tête de toutes les pages, course comprise. */
export function LanguageSelect() {
  const { t, lang, setLang } = useLanguage();
  return (
    <select
      aria-label={t("lang.select")}
      className="font-pixel h-10 shrink-0 border-3 border-white bg-[#c6c6c6] px-1 text-[11px] sm:px-2"
      style={{ borderColor: "#fff #555 #555 #fff" }}
      value={lang}
      onChange={(e) => {
        setLang(e.target.value as SiteLang);
        // En course, les frappes doivent retourner au texte et non au menu.
        e.target.blur();
      }}
    >
      <option value="fr">FR</option>
      <option value="en">EN</option>
    </select>
  );
}
