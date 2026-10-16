"use client";

import { useParams, useRouter } from "next/navigation";
import { participantName } from "@/lib/bot-name";
import { useEffect, useRef, useState } from "react";
import { InvitePanel } from "@/components/lobby/InvitePanel";
import {
  HostSettingsEditor,
  type HostSettingsEditorHandle,
} from "@/components/lobby/HostSettingsEditor";
import { HistoryIcon } from "@/components/history/icons";
import { PixelShell } from "@/components/PixelShell";
import { PixelAvatar, PixelButton, PixelPanel, PixelSlot } from "@/components/ui";
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

  async function closeLobby() {
    await fetch(`/api/lobbies/${code}`, { method: "DELETE" });
    router.push("/");
  }

  const participants = players.filter((p) => p.role === "participant");
  const spectators = players.filter((p) => p.role === "spectator");

  return (
    <PixelShell active="jouer">
      {panel && <div className="mb-6">{panel}</div>}
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-grow">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-pixel mb-2.5 text-[10px] text-[#ffd84a]">
                {t("lobby.header", {
                  access: (lobby?.access ?? "public").toUpperCase(),
                  language: (lobby?.language ?? "fr").toUpperCase(),
                })}
              </div>
              <h1 className="font-pixel text-xl text-white [text-shadow:4px_4px_0_#000]">
                {lobby?.name.toUpperCase() ?? "…"}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {code.split("").map((c, i) => (
                <span
                  key={i}
                  className="pixel-slot font-pixel flex h-14 w-11 items-center justify-center text-xl text-white"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {editing && lobby?.isHost && (
            <HostSettingsEditor
              code={code}
              lobby={lobby}
              handle={editor}
              onClose={() => setEditing(false)}
            />
          )}

          {!(editing && lobby?.isHost) && (
            <PixelPanel className="pixel-reveal p-5">
              <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-pixel text-sm whitespace-nowrap text-[#2b2b2b]">
                  {t("lobby.players", {
                    count: participants.length,
                    max: lobby?.maxPlayers ?? "…",
                  })}
                </span>
                <span className="text-2xl whitespace-nowrap text-[#3a3a3a]">
                  {t("lobby.spectators", { count: spectators.length })}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {participants.map((p, i) => (
                  <PixelSlot key={p.id} className="flex h-16 items-center gap-3 px-2.5">
                    <PixelAvatar
                      label={participantName(t, p)[0]?.toUpperCase() ?? "?"}
                      color={p.isBot ? "#555555" : AVATAR_COLORS[i % AVATAR_COLORS.length]!}
                      seed={p.isBot ? null : participantName(t, p)}
                      src={p.avatarUrl}
                      className="h-9 w-9 text-sm"
                    />
                    <div className="min-w-0 flex-grow leading-none">
                      <div className="truncate text-2xl text-white">{participantName(t, p)}</div>
                      <div className="font-pixel mt-1 text-[8px] text-white">
                        {p.isBot
                          ? t("lobby.tag_bot")
                          : !p.connected
                            ? t("lobby.tag_offline")
                            : p.isHost
                              ? p.isSelf
                                ? t("lobby.tag_host_you")
                                : t("lobby.tag_host")
                              : p.isSelf
                                ? t("lobby.tag_you")
                                : t("lobby.tag_ready")}
                      </div>
                    </div>
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
                        className="pixel-chip h-8 w-8 flex-none text-xl leading-none"
                      >
                        ×
                      </button>
                    )}
                  </PixelSlot>
                ))}
              </div>
              {spectators.length > 0 && (
                <ul aria-label={t("lobby.spectators_list")} className="mt-4 flex flex-wrap gap-2">
                  {spectators.map((p) => (
                    <li key={p.id} className="pixel-chip flex items-center gap-2 text-xl">
                      <span>{participantName(t, p)}</span>
                      {lobby?.isHost && !p.isHost && (
                        <button
                          type="button"
                          onClick={() => void kick(p.id)}
                          aria-label={t("lobby.kick", { name: participantName(t, p) })}
                          title={t("lobby.kick_title")}
                          className="leading-none"
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </PixelPanel>
          )}
        </div>

        <div className="flex w-full flex-col gap-5 lg:w-96 lg:flex-none">
          <PixelPanel className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-pixel text-sm text-[#2b2b2b]">{t("lobby.settings")}</span>
              {lobby?.isHost && (
                <button
                  type="button"
                  onClick={() => (editing ? editor.current?.requestClose() : setEditing(true))}
                  aria-expanded={editing}
                  data-variant={editing ? "slate" : "gold"}
                  className="pixel-btn h-9 gap-2 px-3 text-[9px]"
                >
                  <HistoryIcon name={editing ? "close" : "edit"} />
                  {editing ? t("set.close") : t("lobby.edit")}
                </button>
              )}
            </div>
            {[
              [t("lobby.s_language"), (lobby?.language ?? "fr").toUpperCase()],
              [
                t("lobby.s_text"),
                lobby?.textType === "aleatoire" ? t("lobby.text_random") : t("lobby.text_coherent"),
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
              <div
                key={k}
                className="flex justify-between border-b-2 border-dotted border-[#8b8b8b] py-0.5"
              >
                <span className="text-[#3a3a3a]">{k}</span>
                <b className="font-normal">{v}</b>
              </div>
            ))}
          </PixelPanel>

          {lobby?.isHost && (
            <PixelPanel className="flex flex-col gap-3 p-5">
              <span className="font-pixel text-sm text-[#2b2b2b]">{t("lobby.host_box")}</span>
              <p className="text-xl text-[#3a3a3a]">{t("lobby.host_note")}</p>
              <div className="flex flex-wrap gap-2">
                {BOT_LEVELS.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => addBot(lvl)}
                    className="pixel-chip text-lg"
                  >
                    + {t(`bot.${lvl}`).toUpperCase()}
                  </button>
                ))}
              </div>
              <PixelButton
                type="button"
                onClick={closeLobby}
                variant="red"
                className="h-12 text-[11px]"
              >
                {t("lobby.close")}
              </PixelButton>
            </PixelPanel>
          )}

          {lobby?.isHost && <InvitePanel code={code} refreshKey={view} />}

          {error && (
            <div className="border-4 border-black bg-[#f39a8c] px-3.5 py-2.5 text-xl text-black">
              {error}
            </div>
          )}

          {lobby?.isHost ? (
            <PixelButton type="button" onClick={start} variant="green" className="h-24 text-2xl">
              {t("lobby.start")}
            </PixelButton>
          ) : (
            <div className="border-4 border-black bg-[#fff8dc] px-3.5 py-2.5 text-center text-2xl text-black">
              {t("lobby.waiting_host")}
            </div>
          )}
          <p className="-mt-3 text-center text-xl text-[#f1e6c9]">
            {t("lobby.ready_count", { count: participants.length })}
          </p>
        </div>
      </div>
    </PixelShell>
  );
}
