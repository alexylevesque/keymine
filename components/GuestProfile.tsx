"use client";

import { useEffect, useState } from "react";
import { PixelButton, PixelPanel, PixelSlot } from "@/components/ui";
import { useLanguage } from "@/lib/i18n";
import { formatPercent } from "@/lib/format";

type GuestRace = { code: string; wpm: number; accuracy: number; errors: number; at: string };

// STAT-8: en invité, les stats ne vivent que le temps de l'onglet (AUTH-8).
export function GuestProfile() {
  const { t, lang } = useLanguage();
  const [history, setHistory] = useState<GuestRace[]>([]);

  useEffect(() => {
    // sessionStorage n'existe que côté navigateur: on ne peut pas le lire
    // pendant le rendu serveur sans provoquer un mismatch d'hydratation, d'où
    // cette lecture différée après le montage.
    try {
      const raw = sessionStorage.getItem("km_guest_history");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      // navigation privée ou stockage bloqué: on affiche juste une liste vide
    }
  }, []);

  const best = history.reduce((m, r) => Math.max(m, r.wpm), 0);

  return (
    <div className="flex flex-col gap-6">
      <PixelPanel className="p-6 text-center">
        <p className="text-2xl leading-tight text-[#3a3a3a]">
          {t("guest.note")}
        </p>
        <PixelButton href="/connexion" variant="green" className="mx-auto mt-4 h-14 px-8 text-sm">
          {t("guest.create_account")}
        </PixelButton>
      </PixelPanel>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <PixelSlot className="p-2.5 leading-none">
          <b className="font-pixel mb-1 block text-[9px] text-[#ffefb3]">{t("profile.best")}</b>
          <span className="text-3xl text-white">{best} {t("race.wpm")}</span>
        </PixelSlot>
        <PixelSlot className="p-2.5 leading-none">
          <b className="font-pixel mb-1 block text-[9px] text-[#ffefb3]">{t("guest.session_races")}</b>
          <span className="text-3xl text-white">{history.length}</span>
        </PixelSlot>
      </div>

      <PixelPanel className="p-5">
        <div className="font-pixel mb-2.5 text-sm">{t("guest.session_list")}</div>
        {history.length === 0 && (
          <p className="text-xl text-[#3a3a3a]">{t("profile.history_empty")}</p>
        )}
        {history.map((h, i) => (
          <div
            key={i}
            className="flex items-center justify-between border-b-2 border-dotted border-[#8b8b8b] py-1 text-xl"
          >
            <span>{t("guest.room", { code: h.code })}</span>
            <span className="text-[#3a3a3a]">{Math.round(h.wpm)} {t("race.wpm")}</span>
            <span className="text-[#3a3a3a]">{formatPercent(lang, h.accuracy)}</span>
          </div>
        ))}
      </PixelPanel>
    </div>
  );
}
