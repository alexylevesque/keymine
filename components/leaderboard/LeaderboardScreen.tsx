"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ItemIcon } from "@/components/items/ItemIcon";
import { PixelButton, PixelDisclosure, PixelPanel } from "@/components/ui";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import { useLanguage, type DictKey } from "@/lib/i18n";
import { itemName } from "@/lib/item-text";
import type { ItemId } from "@/lib/items";
import type { LeaderboardView } from "@/lib/leaderboard-view";
import { levelFromXp } from "@/lib/xp";
import { Crown, LEAGUE_COLORS, LeagueBadge } from "./badges";

// Page CLASSEMENT (fonctionnalité ajoutée) : classement général en direct (niveau, meilleur MPM,
// victoires) et classes de la semaine (prix, montées, descentes). Rafraîchi toutes les 15 secondes.

type Tab = "level" | "wpm" | "wins";
const TABS: { id: Tab; label: DictKey }[] = [
  { id: "level", label: "lb.tab_level" },
  { id: "wpm", label: "lb.tab_wpm" },
  { id: "wins", label: "lb.tab_wins" },
];
const REFRESH_MS = 15_000;

/** Temps restant : jours (traduits) et « hh:mm:ss ». */
function countdown(ms: number): { days: number; hms: string } {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    days: Math.floor(s / 86_400),
    hms: `${pad(Math.floor((s % 86_400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`,
  };
}

export function LeaderboardScreen({ initial }: { initial: LeaderboardView }) {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [tab, setTab] = useState<Tab>("level");
  const [league, setLeague] = useState(initial.week.league);
  const [skew] = useState(() => initial.serverNow - Date.now());
  const [now, setNow] = useState(() => Date.now() + skew);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (wanted: number) => {
    const res = await fetch(`/api/leaderboard?league=${wanted}`).catch(() => null);
    if (res?.ok) setView((await res.json()) as LeaderboardView);
  }, []);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now() + skew), 1_000);
    return () => clearInterval(clock);
  }, [skew]);

  useEffect(() => {
    const poll = setInterval(() => void refresh(league), REFRESH_MS);
    return () => clearInterval(poll);
  }, [league, refresh]);

  // La semaine se termine : le rafraîchissement des 15 secondes ramène les résultats et les prix.

  function pickLeague(next: number) {
    setLeague(next);
    void refresh(next);
  }

  async function claim(rewardId: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rewardId }),
    }).catch(() => null);
    setBusy(false);
    const data = (await res?.json().catch(() => null)) as
      (LeaderboardView & { error?: string }) | null;
    if (!res?.ok || !data) {
      setMessage({ text: data?.error ?? t("err.generic"), error: true });
      return;
    }
    setView({ ...data, week: league === data.week.league ? data.week : view.week });
    setMessage({ text: t("lb.claimed"), error: false });
    router.refresh(); // l'XP de l'en-tête
  }

  const champions = new Map(view.champions);
  const me = view.me;
  const pct = (n: number) => formatPercent(lang, n * 100);
  const leagueName = (l: number) => t(`league.${l}` as DictKey);
  const place = (n: number) => (n <= 3 ? t(`lb.place_${n}` as DictKey) : t("lb.place_n", { n }));
  const itemsText = (items: { item: ItemId; count: number }[]) =>
    items.map((i) => `${itemName(t, i.item)} × ${i.count}`).join(", ");

  const name = (row: { userId: string; name: string; league: number }) => (
    <span className="flex min-w-0 items-center gap-2">
      <LeagueBadge league={row.league} />
      <span className="truncate">{row.name}</span>
      {champions.has(row.userId) && <Crown league={champions.get(row.userId)!} />}
      {me?.userId === row.userId && (
        <b className="font-pixel text-[9px] text-[#9a6b0a]">{t("lb.you")}</b>
      )}
    </span>
  );

  // Progression dans ma classe (idée C).
  const myLeague = me?.league ?? null;
  const rows = view.week.rows;
  let progress: string | null = null;
  if (me && league === myLeague) {
    const mine = rows.find((r) => r.userId === me.userId);
    if (!mine) progress = t("lb.progress_none");
    else if (mine.position <= view.week.up && mine.wins >= view.week.minWins) {
      progress = t("lb.progress_top", { wins: mine.wins, pos: mine.position });
    } else {
      const last = rows[view.week.up - 1];
      const beat = last && last.userId !== mine.userId ? last.wins - mine.wins + 1 : 0;
      const n = Math.max(1, view.week.minWins - mine.wins, beat);
      progress = t("lb.progress_need", { wins: mine.wins, n });
    }
  }
  const prizes = view.prizes.league[league]!;

  return (
    <div className="flex flex-col gap-6">
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`text-2xl ${message.error ? "text-[#f39a8c]" : "text-[#7fc45a]"}`}
        >
          {message.text}
        </p>
      )}

      {me?.rewards.map((reward) => (
        <PixelPanel key={reward.id} className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex gap-1">
            {reward.items.map((i) => (
              <span
                key={i.item}
                className="pixel-slot relative flex h-14 w-14 items-center justify-center"
              >
                <ItemIcon item={i.item} className="h-3/4 w-3/4" />
                {i.count > 1 && <span className="inv-count">{i.count}</span>}
              </span>
            ))}
          </div>
          <div className="min-w-56 flex-1 text-2xl text-[#2b2b2b]">
            <h2 className="font-pixel mb-1 text-sm">{t("lb.reward_title")}</h2>
            <p>
              {reward.kind === "wins"
                ? t("lb.reward_wins", {
                    place: place(reward.rank),
                    league: leagueName(reward.league),
                    date: formatDate(lang, `${reward.weekStart}T12:00:00`),
                  })
                : t("lb.reward_wpm", { date: formatDate(lang, `${reward.weekStart}T12:00:00`) })}
            </p>
            <p className="text-xl">
              {t("lb.reward_gives", {
                list: [
                  reward.xp > 0 ? `${formatNumber(lang, reward.xp)} XP` : null,
                  reward.items.length > 0 ? itemsText(reward.items) : null,
                  reward.boost > 0 ? t("lb.reward_boost", { boost: pct(reward.boost) }) : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
              })}
            </p>
          </div>
          <PixelButton
            variant="gold"
            disabled={busy}
            onClick={() => void claim(reward.id)}
            className="h-12 px-5 text-[11px]"
          >
            {t("lb.claim")}
          </PixelButton>
        </PixelPanel>
      ))}

      {me && (me.lastMove || me.boost > 0) && (
        <PixelPanel className="flex flex-col gap-1 p-4 text-2xl text-[#2b2b2b]">
          {me.lastMove && me.lastMove.to > me.lastMove.from && (
            <p>{t("lb.moved_up", { league: leagueName(me.lastMove.to) })}</p>
          )}
          {me.lastMove && me.lastMove.to < me.lastMove.from && (
            <p>{t("lb.moved_down", { league: leagueName(me.lastMove.to) })}</p>
          )}
          {me.boost > 0 && me.boostUntil && (
            <p>
              {t("lb.boost_active", {
                boost: pct(me.boost),
                date: formatDate(lang, new Date(me.boostUntil), true),
              })}
            </p>
          )}
        </PixelPanel>
      )}
      {!me && (
        <PixelPanel className="p-4 text-2xl text-[#2b2b2b]">
          <p className="mb-3">{t("lb.guest")}</p>
          <PixelButton href="/connexion" className="h-11 px-5 text-[10px]">
            {t("home.account")}
          </PixelButton>
        </PixelPanel>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Classement général */}
        <PixelPanel className="p-4">
          <h2 className="font-pixel mb-1 text-sm text-[#2b2b2b]">{t("lb.general")}</h2>
          <p className="mb-3 text-xl text-[#3a3a3a]">{t("lb.live")}</p>
          <div role="tablist" aria-label={t("lb.general")} className="mb-3 flex flex-wrap gap-2">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`lb-tab-${item.id}`}
                aria-selected={tab === item.id}
                aria-controls="lb-board"
                onClick={() => setTab(item.id)}
                data-variant={tab === item.id ? "green" : "slate"}
                className="pixel-btn h-10 px-3 text-[9px]"
              >
                {t(item.label)}
              </button>
            ))}
          </div>
          <div
            id="lb-board"
            role="tabpanel"
            aria-labelledby={`lb-tab-${tab}`}
            className="overflow-x-auto"
          >
            <table className="w-full text-left text-xl text-[#2b2b2b]">
              <thead>
                <tr className="text-lg text-[#3a3a3a]">
                  <th scope="col" className="w-14 pr-2">
                    {t("lb.col_rank")}
                  </th>
                  <th scope="col" className="w-full">
                    {t("lb.col_player")}
                  </th>
                  <th scope="col" className="text-right">
                    {tab === "level"
                      ? t("lb.col_level")
                      : tab === "wpm"
                        ? t("lb.col_wpm")
                        : t("lb.col_wins")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.boards[tab].map((row) => (
                  <tr
                    key={row.userId}
                    data-me={me?.userId === row.userId}
                    className="border-t-2 border-dotted border-[#9a9a9a] data-[me=true]:bg-[#ffe08a]"
                  >
                    <td className="font-pixel py-1 pr-2 text-[11px]">{row.position}</td>
                    <td className="w-full max-w-0 py-1">{name(row)}</td>
                    <td className="py-1 text-right">
                      {tab === "level"
                        ? levelFromXp(row.xp).level
                        : tab === "wpm"
                          ? formatNumber(lang, row.bestWpm, 1)
                          : row.wins}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {view.boards[tab].length === 0 && <p className="text-xl">{t("lb.empty")}</p>}
          </div>
        </PixelPanel>

        {/* Classes de la semaine */}
        <PixelPanel className="p-4">
          <h2 className="font-pixel mb-1 text-sm text-[#2b2b2b]">{t("lb.week_title")}</h2>
          <p className="mb-3 text-xl text-[#3a3a3a]">
            {(() => {
              const left = countdown(view.week.endsAt - now);
              const time = left.days > 0 ? t("lb.days", { d: left.days, hms: left.hms }) : left.hms;
              return t("lb.ends", { time });
            })()}
          </p>
          <div role="group" aria-label={t("lb.league_pick")} className="mb-3 flex flex-wrap gap-2">
            {[0, 1, 2, 3, 4].map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={league === l}
                onClick={() => pickLeague(l)}
                className="lb-league-btn"
                style={{ ["--league" as string]: LEAGUE_COLORS[l] }}
              >
                {leagueName(l)}
              </button>
            ))}
          </div>
          <p className="mb-1 text-xl text-[#2b2b2b]">
            {t("lb.rules", {
              active: rows.length,
              up: view.week.up,
              down: league === 0 ? 0 : view.week.down,
              min: view.week.minWins,
            })}
          </p>
          {progress && <p className="mb-3 text-xl text-[#23501a]">{progress}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xl text-[#2b2b2b]">
              <thead>
                <tr className="text-lg text-[#3a3a3a]">
                  <th scope="col" className="w-14 pr-2">
                    {t("lb.col_rank")}
                  </th>
                  <th scope="col" className="w-full">
                    {t("lb.col_player")}
                  </th>
                  <th scope="col" className="text-right">
                    {t("lb.col_wins")}
                  </th>
                  <th
                    scope="col"
                    className="hidden px-2 text-right whitespace-nowrap sm:table-cell"
                  >
                    {t("lb.col_week_wpm")}
                  </th>
                  <th scope="col" className="w-20 text-right">
                    <span className="sr-only">{t("lb.zone_up")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const up =
                    row.position <= view.week.up && row.wins >= view.week.minWins && league < 4;
                  const down =
                    league > 0 &&
                    view.week.down > 0 &&
                    row.position > rows.length - view.week.down &&
                    row.position > view.week.up;
                  return (
                    <tr
                      key={row.userId}
                      data-me={me?.userId === row.userId}
                      className="border-t-2 border-dotted border-[#9a9a9a] data-[me=true]:bg-[#ffe08a]"
                    >
                      <td className="font-pixel py-1 pr-2 text-[11px]">{row.position}</td>
                      <td className="w-full max-w-0 py-1">{name(row)}</td>
                      <td className="py-1 text-right">{row.wins}</td>
                      <td className="hidden py-1 text-right sm:table-cell">
                        {formatNumber(lang, row.bestWpm, 1)}
                      </td>
                      <td className="font-pixel py-1 text-right text-[8px]">
                        {up && <span className="text-[#23501a]">▲ {t("lb.zone_up")}</span>}
                        {down && <span className="text-[#9b3a2e]">▼ {t("lb.zone_down")}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && <p className="text-xl">{t("lb.empty")}</p>}
          </div>
          <PixelDisclosure title={t("lb.prizes")} className="mt-4">
            <ul className="list-none text-xl text-[#2b2b2b]">
              {prizes.map((prize, i) => (
                <li key={i}>
                  {t("lb.prize_line", {
                    place: place(i + 1),
                    xp: prize.xp,
                    items: itemsText(prize.items),
                    boost: pct(prize.boost),
                  })}
                </li>
              ))}
              <li>{t("lb.prize_other", { boost: pct(view.prizes.otherBoost[league] ?? 0) })}</li>
              <li className="mt-2">
                {t("lb.prize_wpm", {
                  xp: view.prizes.wpm.xp,
                  items: itemsText(view.prizes.wpm.items),
                })}
              </li>
            </ul>
          </PixelDisclosure>
        </PixelPanel>
      </div>

      {/* Semaine passée */}
      <PixelPanel className="p-4">
        <h2 className="font-pixel mb-3 text-sm text-[#2b2b2b]">{t("lb.last_week")}</h2>
        {view.lastWeek.length === 0 ? (
          <p className="text-xl text-[#2b2b2b]">{t("lb.last_week_none")}</p>
        ) : (
          <div className="flex flex-wrap gap-6 text-xl text-[#2b2b2b]">
            {[4, 3, 2, 1, 0].map((l) => {
              const podium = view.lastWeek.filter((r) => r.kind === "wins" && r.league === l);
              if (podium.length === 0) return null;
              return (
                <div key={l}>
                  <h3 className="mb-1 flex items-center gap-2 text-2xl">
                    <LeagueBadge league={l} withName />
                  </h3>
                  <ol className="list-none">
                    {podium.map((r) => (
                      <li key={r.rank} className="flex items-center gap-2">
                        {place(r.rank)} · {r.name}
                        {r.rank === 1 && <Crown league={l} />}
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
            {view.lastWeek
              .filter((r) => r.kind === "wpm")
              .map((r) => (
                <p key="wpm" className="self-end">
                  {t("lb.last_wpm", { name: r.name })}
                </p>
              ))}
          </div>
        )}
      </PixelPanel>
    </div>
  );
}
