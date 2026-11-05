"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ItemIcon } from "@/components/items/ItemIcon";
import { PixelAvatar } from "@/components/ui";
import { ProgressChart } from "@/components/ProgressChart";
import { TileBars, runningAverage } from "@/components/history/TileBars";
import { useLanguage, type DictKey } from "@/lib/i18n";
import { formatNumber, formatPercent } from "@/lib/format";
import { identicon } from "@/lib/identicon";
import type { ItemId } from "@/lib/items";
import { useViewer } from "@/lib/viewer";

type GuestRace = { code: string; wpm: number; accuracy: number; errors: number; at: string };

/** Ce qu'un compte débloque, avec l'objet qui l'illustre. */
const PERKS: [ItemId, DictKey][] = [
  ["xp_bottle", "guest.perk_xp"],
  ["diamond_chestplate", "guest.perk_inv"],
  ["gold_ingot", "guest.perk_shop"],
  ["netherite_ingot", "guest.perk_class"],
  ["totem", "guest.perk_history"],
];

// STAT-8: en invité, les stats ne vivent que le temps de l'onglet (AUTH-8). Même style que le profil
// d'un compte (maquette « 5 · Profil »), avec ce qu'un compte débloque.
export function GuestProfile() {
  const { t, lang } = useLanguage();
  const viewer = useViewer();
  const name = viewer?.name ?? t("common.guest");
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

  const wpms = history.map((h) => Math.round(h.wpm));
  const best = wpms.reduce((m, w) => Math.max(m, w), 0);
  const avg = wpms.length ? Math.round(wpms.reduce((a, b) => a + b, 0) / wpms.length) : null;
  const acc = history.length ? history.reduce((a, h) => a + h.accuracy, 0) / history.length : null;

  return (
    <div className="flex flex-col gap-7">
      <section className="lobby-panel prof-hero" aria-labelledby="nom">
        <span className="prof-avatar">
          <PixelAvatar
            label={name[0]?.toUpperCase() ?? "?"}
            color={identicon(name).color}
            seed={name}
            className="h-full w-full border-0 text-4xl"
          />
        </span>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-3.5">
            <h1
              id="nom"
              className="font-pixel text-2xl break-all text-white [text-shadow:4px_4px_0_#000]"
            >
              {name
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toUpperCase()}
            </h1>
            <span className="prof-class font-pixel">{t("guest.tag")}</span>
          </div>
          <span className="text-[19px] text-[#a8966e]">{t("guest.session_note")}</span>
          <Link href="/connexion" className="room-lift font-pixel guest-cta self-start">
            {t("guest.create_account")}
          </Link>
        </div>
        <div className="prof-stats !grid-cols-2 lg:!grid-cols-4">
          <div className="hist-tile">
            <span className="font-pixel text-[8px] text-[#ffe08a]">{t("profile.best")}</span>
            <span className="hist-num text-[#f0b429]">
              {formatNumber(lang, best)} <small>{t("race.wpm")}</small>
            </span>
            <TileBars values={wpms.slice(-8)} last="#f0b429" />
          </div>
          <div className="hist-tile">
            <span className="font-pixel text-[8px] text-[#ffe08a]">{t("profile.average")}</span>
            <span className="hist-num">
              {avg != null ? formatNumber(lang, avg) : "—"} <small>{t("race.wpm")}</small>
            </span>
            <TileBars values={runningAverage(wpms.slice(-8))} last="#7fc45a" />
          </div>
          <div className="hist-tile">
            <span className="font-pixel text-[8px] text-[#ffe08a]">{t("profile.accuracy")}</span>
            <span className="hist-num">
              {acc != null ? formatPercent(lang, Math.round(acc)) : "—"}
            </span>
            <span className="prof-seg" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} data-on={i < Math.round((acc ?? 0) / 10)} />
              ))}
            </span>
          </div>
          <div className="hist-tile">
            <span className="font-pixel text-[8px] text-[#ffe08a]">{t("guest.session_races")}</span>
            <span className="hist-num">{history.length}</span>
            <span className="hist-dots" aria-hidden="true">
              {history.slice(-16).map((_, i) => (
                <span key={i} data-kind="played" />
              ))}
            </span>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-stretch gap-7">
        <section className="lobby-panel min-w-0 flex-[999_1_520px]" aria-labelledby="prog">
          <div className="lobby-head flex flex-wrap items-center justify-between gap-3 !py-3.5">
            <h2
              id="prog"
              className="font-pixel text-[11px] text-white [text-shadow:3px_3px_0_#000]"
            >
              {t("profile.progress_title")}
            </h2>
            <span className="text-xl text-white">
              {t("profile.progress_sub", { count: history.length })}
            </span>
          </div>
          <div className="p-4">
            {history.length > 0 ? (
              <ProgressChart
                data={history.map((h) => ({ wpm: h.wpm, at: new Date(h.at) }))}
                lang={lang}
                label={t("profile.progress_aria")}
                averageLabel={t("profile.progress_average")}
                wpmLabel={t("race.wpm")}
              />
            ) : (
              <div className="flex flex-col items-center gap-4 p-6 text-center">
                <p className="text-2xl text-[#a8966e]">{t("guest.play_first")}</p>
                <Link
                  href="/"
                  className="room-lift font-pixel bg-[#3f7d24] px-5 py-3.5 text-[11px] text-white"
                >
                  {t("home.play")}
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="lobby-panel min-w-0 flex-[1_1_420px]" aria-labelledby="perks">
          <div className="border-b-2 border-[#3b2a1a] px-5 py-3.5">
            <h2 id="perks" className="font-pixel text-[11px] text-white">
              {t("guest.perks")}
            </h2>
          </div>
          <ul className="flex flex-col gap-2.5 p-5">
            {PERKS.map(([item, key], i) => (
              <li key={key} className="guest-perk" style={{ animationDelay: `${i * 0.08}s` }}>
                <span className="guest-perk-ico">
                  <ItemIcon item={item} className="h-9 w-9" />
                </span>
                <span className="min-w-0 flex-1 text-xl leading-tight">{t(key)}</span>
                <span className="guest-lock font-pixel">{t("guest.locked")}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="lobby-panel" aria-labelledby="session">
        <div className="border-b-2 border-[#3b2a1a] px-5 py-3.5">
          <h2 id="session" className="font-pixel text-[11px] text-white">
            {t("guest.session_list")}
          </h2>
        </div>
        {history.length === 0 ? (
          <p className="px-5 py-4 text-xl text-[#cdbf9c]">{t("profile.history_empty")}</p>
        ) : (
          <div role="table" aria-label={t("guest.session_list")}>
            <div role="row" className="guest-cols hist-thead font-pixel">
              <span role="columnheader">{t("guest.c_race")}</span>
              <span role="columnheader">{t("guest.c_wpm")}</span>
              <span role="columnheader">{t("guest.c_acc")}</span>
              <span role="columnheader">{t("guest.c_err")}</span>
            </div>
            {[...history].reverse().map((h, i) => (
              <div
                key={i}
                role="row"
                className="guest-cols hist-row"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <span role="cell" className="text-[22px] text-white">
                  {t("guest.room", { code: h.code })}
                </span>
                <span role="cell" className="text-[26px] text-white">
                  {Math.round(h.wpm)}
                </span>
                <span role="cell" className="text-[22px]">
                  {formatPercent(lang, h.accuracy)}
                </span>
                <span role="cell" className="text-[22px]">
                  {h.errors}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
