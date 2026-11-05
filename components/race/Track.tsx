"use client";

import { Crown } from "@/components/leaderboard/badges";
import { useState, useSyncExternalStore } from "react";
import { identicon } from "@/lib/identicon";
import { Diamond, Miner } from "./MinePixels";
import type { WornArmor } from "@/lib/armor-look";
import { participantName } from "@/lib/bot-name";
import { useLanguage } from "@/lib/i18n";
import type { RaceParticipantView } from "./types";
import { compactRows, rowsThatFit } from "./track-rows";

// COURSE-05 : piste de progression. Chaque participant (humain ou bot) a son
// avatar, son nom, sa position et son MPM ; le mouvement est lissé par une
// transition CSS entre deux mises à jour (4 par seconde) ; le joueur local est
// mis en évidence ; les bots sont clairement étiquetés (BOT-04).

function useViewportHeight(): number {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("resize", notify);
      return () => window.removeEventListener("resize", notify);
    },
    () => window.innerHeight,
    () => 900,
  );
}

const AVATAR_COLORS = ["#3d6fc4", "#b03a7a", "#a85512", "#17706f", "#7a45b0", "#3f7d24", "#b63a32"];
// Bots : couleurs de la maquette (brun, bleu, vert…).
const BOT_COLORS = ["#7a5a3a", "#2b5c7a", "#3f7d24", "#7a45b0", "#a85512"];

export function Track({
  participants,
  meId,
  showBotLabel,
  armor = {},
}: {
  /** Armure portée par chaque participant (rien pour les invités et les bots). */
  armor?: Record<string, WornArmor>;
  participants: RaceParticipantView[];
  meId: string | null;
  showBotLabel: string;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const viewportHeight = useViewportHeight();
  const ordered = [...participants].sort((a, b) => a.rank - b.rank);
  const limit = rowsThatFit(viewportHeight);
  const collapsible = ordered.length > limit;
  const rows = open || !collapsible ? ordered : compactRows(ordered, meId, limit);
  const hiddenCount = ordered.length - rows.length;

  // Rang du joueur local : le badge clignote quand il s'améliore (dépassement).
  const myRank = ordered.find((p) => p.id === meId)?.rank ?? null;
  const [previousRank, setPreviousRank] = useState(myRank);
  const [flashes, setFlashes] = useState(0);
  if (myRank !== previousRank) {
    setPreviousRank(myRank);
    if (myRank !== null && previousRank !== null && myRank < previousRank) setFlashes((n) => n + 1);
  }

  return (
    <div>
      <ol className="flex flex-col gap-3" aria-label={t("race.track_aria")}>
        {rows.map((p) => {
          const index = ordered.indexOf(p);
          const isMe = p.id === meId;
          const pct = Math.min(100, Math.max(0, p.fraction * 100));
          const left = `${pct}%`;
          const name = participantName(t, p);
          const color = p.isBot
            ? BOT_COLORS[index % BOT_COLORS.length]!
            : p.avatarUrl
              ? AVATAR_COLORS[index % AVATAR_COLORS.length]!
              : identicon(name).color;
          // Plus il tape vite, plus le mineur court vite (0,6 s par pas au repos, 0,2 s à 120 MPM).
          const speed = Math.max(0.2, 0.6 - Math.min(120, p.wpm) / 300);
          const moving = p.status === "racing" && p.wpm > 0;
          const tag = isMe ? t("race.you") : p.isBot ? showBotLabel : "";
          return (
            <li key={p.id} data-me={isMe} data-status={p.status} className="mine-racer">
              <span className={`font-pixel mine-rank ${p.rank === 1 ? "mine-rank1" : ""}`}>
                {p.rank}
              </span>
              <span className="min-w-0 leading-none">
                <span className="flex min-w-0 items-center gap-1.5 text-[23px] text-white">
                  <span className="truncate">{name}</span>
                  {p.champion != null && <Crown league={p.champion} />}
                </span>
                {tag && (
                  <span
                    className="font-pixel mt-1 block text-[7px]"
                    style={{ color: isMe ? "var(--km-gold-ink)" : "var(--km-ink-3)" }}
                  >
                    {tag}
                  </span>
                )}
              </span>
              <span className={`mine-lane ${isMe ? "mine-me" : ""}`} aria-hidden="true">
                <span className="mine-rock" />
                <span className="mine-dug" style={{ width: left }} />
                {moving && (
                  <>
                    <span className="mine-dust" style={{ left }} />
                    <span className="mine-dust mine-d2" style={{ left }} />
                  </>
                )}
                <span
                  className={`mine-runner ${moving ? "" : "mine-still"}`}
                  style={{ left: `clamp(36px, ${left}, calc(100% - 56px))` }}
                >
                  <Miner
                    color={color}
                    speed={speed}
                    worn={armor[p.id]}
                    photoUrl={p.isBot ? null : p.avatarUrl}
                  />
                  {isMe && (
                    // Le badge de rang suit le mineur ; `key` relance l'animation à chaque dépassement.
                    <span
                      key={flashes}
                      data-testid="my-rank-badge"
                      className={`font-pixel mine-badge ${flashes > 0 ? "rank-flash" : ""}`}
                    >
                      {p.rank}
                    </span>
                  )}
                </span>
                <span className="mine-goal">
                  <Diamond />
                  <span className="mine-glint" />
                </span>
              </span>
              <span className="text-right text-2xl whitespace-nowrap text-white">
                {Math.round(p.wpm)}{" "}
                <span className="text-[17px] text-[#a8966e]">{t("race.wpm")}</span>
                {p.status === "abandoned" && <span className="ml-1.5 text-[#ff8f80]">⨯</span>}
                {p.status === "finished" && <span className="ml-1.5 text-[#7fd36a]">✓</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {collapsible && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="pixel-track-toggle mt-3"
        >
          <span aria-hidden="true" className="pixel-disclosure-chevron" data-open={open} />
          {open ? t("race.track_collapse") : t("race.track_expand", { count: hiddenCount })}
        </button>
      )}
    </div>
  );
}
