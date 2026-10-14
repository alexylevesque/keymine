"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PixelPanel, PixelSlot } from "@/components/ui";
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

  return (
    <PixelPanel className="w-full flex-grow self-start p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-pixel text-sm text-[#2b2b2b]">{t("home.public_lobbies")}</h2>
        <span aria-live="polite" className="text-2xl text-[#3a3a3a]">
          {t("lobbies.count", { count: lobbies.length })}
        </span>
      </div>

      <div
        className="mb-3 flex flex-wrap gap-x-5 gap-y-2"
        role="group"
        aria-label={t("lobbies.filters")}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xl text-[#3a3a3a]">{t("lobbies.language")}</span>
          {(
            [
              ["", t("lobbies.all")],
              ["fr", "FR"],
              ["en", "EN"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value || "all"}
              type="button"
              data-on={language === value}
              aria-pressed={language === value}
              onClick={() => setLanguage(value)}
              className="pixel-chip text-lg"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xl text-[#3a3a3a]">{t("lobbies.complexity")}</span>
          {(
            [
              ["", t("lobbies.all")],
              ["easy", t("lobbies.easy")],
              ["medium", t("lobbies.medium")],
              ["hard", t("lobbies.hard")],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value || "all"}
              type="button"
              data-on={complexity === value}
              aria-pressed={complexity === value}
              onClick={() => setComplexity(value)}
              className="pixel-chip text-lg"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {offline && (
        <p role="status" className="mb-2 text-xl text-[#9b3a2e]">
          {t("lobbies.offline")}
        </p>
      )}

      <ul className="flex flex-col gap-2.5">
        {lobbies.length === 0 && <li className="text-2xl text-[#3a3a3a]">{t("lobbies.empty")}</li>}
        {lobbies.map((l) => (
          <li key={l.code}>
            <PixelSlot className="flex flex-wrap items-center gap-3.5 px-3.5 py-2.5">
              <div className="min-w-0 flex-grow">
                <div className="truncate text-2xl leading-none text-white">{l.name}</div>
                <div className="text-xl text-white">
                  {l.language.toUpperCase()} · {complexityText(l.complexity)} · {stateText(l)}
                  {l.hostName ? ` · ${t("lobbies.host", { name: l.hostName })}` : ""}
                </div>
              </div>
              <div
                className="font-pixel text-xs text-white"
                aria-label={t("lobbies.players", { n: l.players, max: l.capacity })}
              >
                {l.players}/{l.capacity}
              </div>
              {l.joinable ? (
                <Link
                  href={`/jouer/${l.code}`}
                  className="pixel-btn h-11 w-36 text-[11px]"
                  data-variant="green"
                >
                  {t("lobbies.join")}
                </Link>
              ) : (
                <span
                  className="pixel-btn h-11 w-36 text-[11px] opacity-70"
                  data-variant="slate"
                  aria-disabled="true"
                >
                  {l.status === "lobby" ? t("lobbies.full") : t("lobbies.in_progress")}
                </span>
              )}
            </PixelSlot>
          </li>
        ))}
      </ul>
    </PixelPanel>
  );
}
