"use client";

// I18N-02: sélecteur de langue sur toutes les pages. La langue initiale est
// décidée côté serveur (cookie, sinon langue du navigateur) pour éviter tout
// clignotement; le choix est ensuite conservé dans le cookie `km_lang`.
// La langue de l'interface est indépendante de la langue du texte d'une course.
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { translate, type DictKey, type SiteLang } from "./i18n-dictionary";

export type { DictKey, SiteLang };

type Params = Record<string, string | number>;
type Ctx = {
  lang: SiteLang;
  setLang: (l: SiteLang) => void;
  t: (key: DictKey, params?: Params) => string;
};

const LanguageContext = createContext<Ctx | null>(null);
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function LanguageProvider({
  initialLang,
  children,
}: {
  initialLang: SiteLang;
  children: ReactNode;
}) {
  const [lang, setLangState] = useState<SiteLang>(initialLang);
  const router = useRouter();

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang: (l) => {
        setLangState(l);
        document.documentElement.lang = l;
        document.cookie = `km_lang=${l}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
        // Les pages rendues côté serveur (accueil, historique, titre de l'onglet)
        // doivent être recalculées dans la nouvelle langue. Une adresse « ?lang= » imposerait
        // l'ancienne langue : on la retire.
        const url = new URL(window.location.href);
        if (url.searchParams.has("lang")) {
          url.searchParams.delete("lang");
          router.replace(url.pathname + url.search + url.hash);
        } else {
          router.refresh();
        }
      },
      t: (key, params) => translate(lang, key, params),
    }),
    [lang, router],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage doit être utilisé sous LanguageProvider");
  return ctx;
}
