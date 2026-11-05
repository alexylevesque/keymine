"use client";

import { Crown } from "@/components/leaderboard/badges";
import { startNavProgress } from "@/components/NavProgress";
import { useParams, useRouter } from "next/navigation";
import { participantName } from "@/lib/bot-name";
import { identicon } from "@/lib/identicon";
import { useEffect, useRef, useState } from "react";
import { InvitePanel } from "@/components/lobby/InvitePanel";
import {
  HostSettingsEditor,
  type HostSettingsEditorHandle,
} from "@/components/lobby/HostSettingsEditor";
import { HistoryIcon } from "@/components/history/icons";
import { PixelShell } from "@/components/PixelShell";
import { PixelAvatar } from "@/components/ui";
import { useLobbyLive } from "@/components/useLobbyLive";
import { useRoomEntry } from "@/components/useRoomEntry";
import { BOT_LEVELS } from "@/lib/race/bots";
import type { BotLevel } from "@/db/types";
import { formatDuration } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n-dictionary";

const COMPLEXITY_KEY: Record<string, DictKey> = {
  easy: "lobbies.easy",
  medium: "lobbies.medium",
  hard: "lobbies.hard",
};

const AVATAR_COLORS = ["#3d6fc4", "#b03a7a", "#a85512", "#17706f", "#7a45b0", "#3f7d24", "#b63a32"];

export default function LobbyPage() {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();

  const [startError, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [closing, setClosing] = useState(false);
  const editor = useRef<HostSettingsEditorHandle>(null);
  const joined = useRef(false);
  const { run, panel } = useRoomEntry(() => setEntered(true), { leaveToHome: true });

  // Entrée dans la salle (pseudo d'invité, déjà dans une autre salle… gérés par le hook).
  useEffect(() => {
    if (joined.current) return;
    joined.current = true;
    void run(() =>
      fetch(`/api/lobbies/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
  }, [code, run]);

  // Présence en direct (WebSocket, repli HTTP) — SALLE-01, SALLE-02, JOIN-01.
  const { view, status } = useLobbyLive(code, entered);
  const error = status === "missing" ? t("lobby.not_found") : startError;
  const lobby = view?.lobby ?? null;
  const players = view?.players ?? [];

  useEffect(() => {
    if (view?.activeRace) router.push(`/course/${code}`);
  }, [view?.activeRace, code, router]);

  // Course terminée : la salle affiche les résultats jusqu'à ce que l'hôte relance.
  useEffect(() => {
    if (lobby?.status === "finished") router.push(`/resultats/${code}`);
  }, [lobby?.status, code, router]);

  useEffect(() => {
    if (status === "closed" || status === "removed") router.push("/");
  }, [status, router]);

  async function kick(playerId: string) {
    await fetch(`/api/lobbies/${code}/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
  }

  async function removeBot(playerId: string) {
    await fetch(`/api/lobbies/${code}/bots`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
  }

  async function addBot(level: BotLevel) {
    await fetch(`/api/lobbies/${code}/bots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level }),
    });
  }

  async function start() {
    const res = await fetch(`/api/lobbies/${code}/start`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? t("lobby.start_failed"));
      return;
    }
    router.push(`/course/${code}`);
  }

  // L'accueil est préchargé : après la fermeture, on y arrive sans attendre.
  useEffect(() => {
    router.prefetch("/");
  }, [router]);

  async function closeLobby() {
    setClosing(true);
    setError(null);
    startNavProgress();
    try {
      const res = await fetch(`/api/lobbies/${code}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? t("err.generic"));
        setClosing(false);
        return;
      }
      startNavProgress();
      router.push("/");
    } catch {
      setError(t("err.network"));
      setClosing(false);
    }
  }

  const participants = players.filter((p) => p.role === "participant");
  const spectators = players.filter((p) => p.role === "spectator");
  const connected = players.filter((p) => !p.isBot && p.connected).length;
  // Cases vides pour compléter la grille (au moins 2 rangées de 3).
  const freeSlots = Math.max(
    0,
    Math.min(
      (lobby?.maxPlayers ?? 0) - participants.length,
      Math.max(6, Math.ceil(participants.length / 3) * 3) - participants.length,
    ),
  );

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible : le code reste lisible à l'écran.
    }
  }

  const colorOf = (p: (typeof players)[number], i: number) =>
    p.isBot
      ? "#5a4632"
      : p.avatarUrl
        ? AVATAR_COLORS[i % AVATAR_COLORS.length]!
        : identicon(participantName(t, p)).color;

  const tagOf = (p: (typeof players)[number]) =>
    p.isBot
      ? t("lobby.tag_bot")
      : !p.connected
        ? t("lobby.tag_offline")
        : p.isHost
          ? p.isSelf
            ? t("lobby.tag_host_you")
            : t("lobby.tag_host")
          : p.isSelf
            ? t("lobby.tag_you")
            : t("lobby.tag_ready");

  const bonusKinds = lobby?.bonusKinds ?? [];

  return (
    <PixelShell active="jouer">
      {panel && <div className="mb-6">{panel}</div>}
      <div className="flex flex-col gap-7">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <span
                className="room-tag font-pixel"
                style={{ background: "#3f7d24", color: "#fff" }}
              >
                {t("lobby.tag_waiting")}
              </span>
              <span className="room-tag font-pixel">
                {lobby?.access === "private" ? t("lobby.access_private") : t("lobby.access_public")}
              </span>
              <span className="room-tag font-pixel">
                {(lobby?.language ?? "fr").toUpperCase()} ·{" "}
                {t(COMPLEXITY_KEY[lobby?.complexity ?? "easy"] ?? "lobbies.easy").toUpperCase()}
              </span>
            </div>
            <h1 className="font-pixel text-xl break-words text-white [text-shadow:4px_4px_0_#000] sm:text-[30px] sm:leading-tight">
              {lobby?.name.toUpperCase() ?? "…"}
              <span className="home-caret" aria-hidden="true" />
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div
              role="img"
              aria-label={t("lobby.code_aria", { code: code.split("").join(" ") })}
              className="flex gap-1.5"
            >
              {code.split("").map((c, i) => (
                <span key={i} aria-hidden="true" className="room-code font-pixel">
                  {c}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void copyCode()}
              className="room-lift font-pixel h-12 bg-[#f0b429] px-4 text-[10px] text-[#1b1209] sm:h-14"
            >
              {copied ? t("lobby.copied_code") : t("lobby.copy_code")}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-7">
          <div className="min-w-0 flex-[999_1_600px]">
            {editing && lobby?.isHost && (
              <HostSettingsEditor
                code={code}
                lobby={lobby}
                handle={editor}
                onClose={() => setEditing(false)}
              />
            )}

            {!(editing && lobby?.isHost) && (
              <section aria-labelledby="joueurs" className="lobby-panel pixel-reveal">
                <div className="lobby-head flex flex-wrap items-center justify-between gap-3">
                  <h2
                    id="joueurs"
                    className="font-pixel text-[13px] text-white [text-shadow:3px_3px_0_#000]"
                  >
                    {t("lobby.players", {
                      count: participants.length,
                      max: lobby?.maxPlayers ?? "…",
                    })}
                  </h2>
                  <span className="flex items-center gap-2 text-xl text-white">
                    <span className="lobby-live" aria-hidden="true" />
                    {t("lobby.connected", { count: connected, spectators: spectators.length })}
                  </span>
                </div>
                <ul className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
                  {participants.map((p, i) => (
                    <li key={p.id}>
                      <div
                        className="room-pcard"
                        style={{
                          borderLeftColor: colorOf(p, i),
                        }}
                      >
                        <PixelAvatar
                          label={participantName(t, p)[0]?.toUpperCase() ?? "?"}
                          color={colorOf(p, i)}
                          seed={p.isBot ? null : participantName(t, p)}
                          src={p.avatarUrl}
                          className="h-11 w-11 flex-none text-sm"
                        />
                        <span className="min-w-0 flex-auto leading-none">
                          <span className="flex min-w-0 items-center gap-1.5 text-[25px] text-white">
                            <span className="truncate">{participantName(t, p)}</span>
                            {p.champion !== null && <Crown league={p.champion} />}
                          </span>
                          <span
                            className="font-pixel mt-1 block text-[8px]"
                            style={{
                              color:
                                p.isBot || !p.connected
                                  ? "#a8966e"
                                  : p.isHost
                                    ? "#ffe08a"
                                    : "#7fc45a",
                            }}
                          >
                            {tagOf(p)}
                          </span>
                        </span>
                        {lobby?.isHost && !p.isHost && (
                          <button
                            type="button"
                            onClick={() => void (p.isBot ? removeBot(p.id) : kick(p.id))}
                            aria-label={
                              p.isBot
                                ? t("lobby.remove_bot", { name: participantName(t, p) })
                                : t("lobby.kick", { name: participantName(t, p) })
                            }
                            title={p.isBot ? t("lobby.remove_bot_title") : t("lobby.kick_title")}
                            className="room-kick font-pixel"
                          >
                            X
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                  {Array.from({ length: freeSlots }, (_, i) => (
                    <li key={`free-${i}`} className="room-free">
                      <span className="font-pixel text-[9px]">{t("lobby.free_slot")}</span>
                    </li>
                  ))}
                </ul>
                {spectators.length > 0 && (
                  <ul
                    aria-label={t("lobby.spectators_list")}
                    className="flex flex-wrap gap-2 px-5 pb-5"
                  >
                    {spectators.map((p) => (
                      <li key={p.id} className="lobby-filter font-pixel flex items-center gap-2">
                        <span>{participantName(t, p)}</span>
                        {lobby?.isHost && !p.isHost && (
                          <button
                            type="button"
                            onClick={() => void kick(p.id)}
                            aria-label={t("lobby.kick", { name: participantName(t, p) })}
                            title={t("lobby.kick_title")}
                            className="text-[#f39a8c]"
                          >
                            X
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {lobby?.isHost && (
                  <div className="flex flex-wrap items-center gap-2 border-t-2 border-[#3b2a1a] px-5 pt-3.5 pb-5">
                    <span className="font-pixel mr-1.5 text-[9px] text-[#a8966e]">
                      {t("lobby.add_bot")}
                    </span>
                    {BOT_LEVELS.map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => addBot(lvl)}
                        className="lobby-filter font-pixel"
                      >
                        +{" "}
                        {t(`bot.${lvl}`)
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "")
                          .toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
            <div className="flex flex-col gap-2">
              {lobby?.isHost ? (
                <button type="button" onClick={start} className="room-start font-pixel">
                  {t("lobby.start")}
                </button>
              ) : (
                <div className="lobby-panel px-3.5 py-4 text-center text-2xl">
                  {t("lobby.waiting_host")}
                </div>
              )}
              <span className="text-center text-xl text-[#cdbf9c]">
                {t("lobby.ready_count", { count: participants.length })}
              </span>
            </div>

            {error && (
              <div
                role="alert"
                className="border-4 border-black bg-[#f39a8c] px-3.5 py-2.5 text-xl text-black"
              >
                {error}
              </div>
            )}

            <section className="lobby-panel" aria-labelledby="reglages">
              <div className="flex items-center justify-between gap-3 border-b-2 border-[#3b2a1a] px-5 py-4">
                <h2 id="reglages" className="font-pixel text-[11px] text-white">
                  {t("lobby.settings")}
                </h2>
                {lobby?.isHost && (
                  <button
                    type="button"
                    onClick={() => (editing ? editor.current?.requestClose() : setEditing(true))}
                    aria-expanded={editing}
                    className="room-lift font-pixel flex h-9 items-center gap-2 bg-[#f0b429] px-2.5 text-[8px] text-[#1b1209]"
                  >
                    <HistoryIcon name={editing ? "close" : "edit"} />
                    {editing ? t("set.close") : t("lobby.edit")}
                  </button>
                )}
              </div>
              <dl className="py-2">
                {[
                  [t("lobby.s_language"), (lobby?.language ?? "fr").toUpperCase()],
                  [
                    t("lobby.s_text"),
                    lobby?.textType === "aleatoire"
                      ? t("lobby.text_random")
                      : t("lobby.text_coherent"),
                  ],
                  [
                    t("lobby.s_complexity"),
                    t(COMPLEXITY_KEY[lobby?.complexity ?? "easy"] ?? "lobbies.easy"),
                  ],
                  [t("lobby.s_length"), t("lobby.words", { count: lobby?.textLength ?? 40 })],
                  [t("lobby.s_duration"), formatDuration(lang, lobby?.durationSeconds ?? 300)],
                  [
                    t("lobby.s_errors"),
                    lobby?.errorMode === "bloquer"
                      ? t("lobby.errors_block")
                      : t("lobby.errors_accumulate"),
                  ],
                ].map(([k, v]) => (
                  <div key={k} className="room-kv">
                    <dt className="text-[#a8966e]">{k}</dt>
                    <dd className="text-white">{v}</dd>
                  </div>
                ))}
                <div className="room-kv items-center">
                  <dt className="text-[#a8966e]">{t("lobby.s_bonus")}</dt>
                  <dd className="flex flex-wrap justify-end gap-1.5">
                    {lobby?.comebackBonus === false || bonusKinds.length === 0 ? (
                      <span className="text-white">{t("lobby.no_bonus")}</span>
                    ) : (
                      bonusKinds.map((b) => (
                        <span key={b} className="room-bon font-pixel">
                          {t(`set.bonus_${b}` as DictKey)}
                        </span>
                      ))
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            {lobby?.isHost && <InvitePanel code={code} refreshKey={view} />}

            {lobby?.isHost && (
              <button
                type="button"
                onClick={() => void closeLobby()}
                disabled={closing}
                className="room-close font-pixel"
              >
                {closing ? t("lobby.closing") : t("lobby.close")}
              </button>
            )}
          </aside>
        </div>
      </div>
    </PixelShell>
  );
}
