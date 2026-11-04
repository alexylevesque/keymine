"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatClock } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import type { PublicLobby } from "@/lib/public-lobbies";

// JOIN-02 : explorateur des salles publiques. Filtres langue et complexité ;
// la liste se rafraîchit toute seule (aucun rechargement manuel).
const REFRESH_MS = 3_000;

type LangFilter = "" | "fr" | "en";
type ComplexityFilter = "" | "easy" | "medium" | "hard";

export function PublicLobbies({ initial }: { initial: PublicLobby[] }) {
  const { t } = useLanguage();
  const [lobbies, setLobbies] = useState(initial);
  const [language, setLanguage] = useState<LangFilter>("");
  const [complexity, setComplexity] = useState<ComplexityFilter>("");
  const [offline, setOffline] = useState(false);
  const first = useRef(true);
  // Le temps restant des courses en cours : mesuré par le serveur à chaque rafraîchissement, décompté ici chaque seconde.
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const params = new URLSearchParams();
        if (language) params.set("language", language);
        if (complexity) params.set("complexity", complexity);
        const res = await fetch(`/api/lobbies/public?${params}`);
        if (stopped) return;
        if (!res.ok) throw new Error(String(res.status));
        setLobbies(((await res.json()) as { lobbies: PublicLobby[] }).lobbies);
        setLoadedAt(Date.now());
        setOffline(false);
      } catch {
        if (!stopped) setOffline(true);
      }
    }
    // Les données initiales du serveur couvrent le premier rendu sans filtre.
    if (first.current && !language && !complexity) first.current = false;
    else void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [language, complexity]);

  const secondsLeft = (l: PublicLobby) =>
    Math.max(0, (l.secondsLeft ?? 0) - (now - loadedAt) / 1000);

  const stateText = (l: PublicLobby) =>
    l.status === "lobby"
      ? t("lobbies.state_waiting")
      : l.secondsLeft === null
        ? t("lobbies.state_racing_nolimit")
        : t("lobbies.state_racing", { time: formatClock(secondsLeft(l)) });

  const complexityText = (c: PublicLobby["complexity"]) =>
    c === "easy" ? t("lobbies.easy") : c === "medium" ? t("lobbies.medium") : t("lobbies.hard");

  const filterButton = (on: boolean, label: string, onClick: () => void, key: string) => (
    <button
      key={key}
      type="button"
      data-on={on}
      aria-pressed={on}
      onClick={onClick}
      className="lobby-filter font-pixel uppercase"
    >
      {label}
    </button>
  );

  const levelBars = (c: PublicLobby["complexity"]) => {
    const lit = c === "easy" ? 1 : c === "medium" ? 2 : 3;
    return [8, 15, 22].map((h, i) => (
      <span key={h} style={{ height: h, background: i < lit ? "#f0b429" : "#3b2a1a" }} />
    ));
  };

  return (
    <section aria-labelledby="salles-title" className="lobby-panel flex w-full flex-col">
      <div className="lobby-head flex flex-wrap items-center justify-between gap-3">
        <h2
          id="salles-title"
          className="font-pixel text-[13px] text-white [text-shadow:3px_3px_0_#000]"
        >
          {t("home.public_lobbies")}
        </h2>
        <span aria-live="polite" className="flex items-center gap-2 text-xl text-white">
          <span className="lobby-live" aria-hidden="true" />
          {t("lobbies.live", { count: lobbies.length })}
        </span>
      </div>

      <div
        className="lobby-filters flex flex-wrap gap-1.5"
        role="group"
        aria-label={t("lobbies.filters")}
      >
        {filterButton(
          !language && !complexity,
          t("lobbies.all"),
          () => {
            setLanguage("");
            setComplexity("");
          },
          "all",
        )}
        {(
          [
            ["fr", "FR"],
            ["en", "EN"],
          ] as const
        ).map(([value, label]) =>
          filterButton(
            language === value,
            label,
            () => setLanguage(language === value ? "" : value),
            `l-${value}`,
          ),
        )}
        <span className="lobby-sep" aria-hidden="true" />
        {(
          [
            ["easy", t("lobbies.easy")],
            ["medium", t("lobbies.medium")],
            ["hard", t("lobbies.hard")],
          ] as const
        ).map(([value, label]) =>
          filterButton(
            complexity === value,
            label,
            () => setComplexity(complexity === value ? "" : value),
            `c-${value}`,
          ),
        )}
      </div>

      {offline && (
        <p role="status" className="px-5 pt-3 text-xl text-[#f39a8c]">
          {t("lobbies.offline")}
        </p>
      )}

      <div role="table" aria-label={t("home.public_lobbies")} className="flex flex-col">
        <div role="row" className="lobby-cols lobby-colhead font-pixel">
          <span role="columnheader">{t("lobbies.col_room")}</span>
          <span role="columnheader">{t("lobbies.col_lang")}</span>
          <span role="columnheader">{t("lobbies.col_level")}</span>
          <span role="columnheader">{t("lobbies.col_players")}</span>
          <span role="columnheader" className="text-right">
            {t("lobbies.col_state")}
          </span>
        </div>
        {lobbies.length === 0 && (
          <p className="lobby-empty text-xl text-[#cdbf9c]">{t("lobbies.empty")}</p>
        )}
        {lobbies.map((l) => {
          const cells = (
            <>
              <span role="cell" className="min-w-0">
                <span className="block truncate text-[25px] leading-tight text-white">
                  {l.name}
                </span>
                <span className="block text-lg text-[#a8966e]">
                  {l.hostName ? t("lobbies.host", { name: l.hostName }) : stateText(l)}
                </span>
              </span>
              <span role="cell" className="font-pixel text-[10px]">
                {l.language.toUpperCase()}
              </span>
              <span
                role="cell"
                className="lobby-bars"
                aria-label={t("lobbies.level_aria", { level: complexityText(l.complexity) })}
              >
                {levelBars(l.complexity)}
              </span>
              <span
                role="cell"
                className="flex flex-col gap-1"
                aria-label={t("lobbies.players", { n: l.players, max: l.capacity })}
              >
                <span className="font-pixel text-[10px]" aria-hidden="true">
                  {l.players}/{l.capacity}
                </span>
                <span className="lobby-fill" aria-hidden="true">
                  <span
                    style={{ width: `${Math.round((l.players / Math.max(1, l.capacity)) * 100)}%` }}
                  />
                </span>
              </span>
              <span role="cell" className="flex justify-end">
                {l.joinable ? (
                  <span className="lobby-go font-pixel">{t("lobbies.join")}</span>
                ) : l.status === "lobby" ? (
                  <span className="font-pixel py-2 text-[8px] text-[#a8966e]">
                    {t("lobbies.full")}
                  </span>
                ) : (
                  <span className="font-pixel py-2 text-right text-[8px] text-[#f0b429]">
                    {t("lobbies.in_progress")}
                    {l.secondsLeft !== null ? ` ${formatClock(secondsLeft(l))}` : ""}
                  </span>
                )}
              </span>
            </>
          );
          return l.joinable ? (
            <Link
              key={l.code}
              role="row"
              href={`/jouer/${l.code}`}
              className="lobby-cols lobby-row"
            >
              {cells}
            </Link>
          ) : (
            <div key={l.code} role="row" className="lobby-cols lobby-row" title={stateText(l)}>
              {cells}
            </div>
          );
        })}
      </div>
    </section>
  );
}
