import "server-only";
import { cookies, headers } from "next/headers";
import type { Metadata } from "next";
import { isSiteLang, pickLang, translate, type DictKey, type SiteLang } from "./i18n-dictionary";

/**
 * Langue de l'interface pour cette requête : « ?lang= » de l'adresse (posé par proxy.ts dans
 * x-km-lang), sinon cookie, sinon Accept-Language.
 */
export async function getRequestLang(): Promise<SiteLang> {
  const [store, requestHeaders] = await Promise.all([cookies(), headers()]);
  const forced = requestHeaders.get("x-km-lang");
  if (isSiteLang(forced)) return forced;
  return pickLang(store.get("km_lang")?.value, requestHeaders.get("accept-language"));
}

/** Titre de page traduit (I18N-01, métadonnées) : « Titre · KeyMine » via le modèle du layout racine. */
export function pageMetadata(key: DictKey): () => Promise<Metadata> {
  return async () => ({ title: translate(await getRequestLang(), key) });
}
