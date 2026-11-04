"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ItemIcon } from "@/components/items/ItemIcon";
import { PixelAvatar, PixelButton } from "@/components/ui";
import { identicon } from "@/lib/identicon";
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

/** Objet qui représente chaque classe sur l'échelle (bronze → netherite). */
const LEAGUE_ITEM: ItemId[] = [
  "copper_ore",
  "iron_ingot",
  "gold_ingot",
  "diamond",
  "netherite_ingot",
];

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
  const [pane, setPane] = useState<"mine" | "general">("mine");
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

  const ends = (() => {
    const left = countdown(view.week.endsAt - now);
    return left.days > 0 ? t("lb.days", { d: left.days, hms: left.hms }) : left.hms;
  })();
  const avatar = (row: { name: string; avatarUrl?: string | null }) => (
    <PixelAvatar
      label={row.name[0]?.toUpperCase() ?? "?"}
      color={identicon(row.name).color}
      src={row.avatarUrl ?? null}
      seed={row.name}
      className="h-[34px] w-[34px] flex-none text-[11px]"
    />
  );
  const who = (row: { userId: string; name: string; avatarUrl?: string | null }) => (
    <span className="flex min-w-0 items-center gap-2.5">
      {avatar(row)}
      <span className="truncate text-2xl text-white">{row.name}</span>
      {champions.has(row.userId) && <Crown league={champions.get(row.userId)!} />}
      {me?.userId === row.userId && <span className="lb-youtag font-pixel">{t("lb.you")}</span>}
    </span>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="-mt-2 flex flex-wrap items-end justify-between gap-4">
        <span className="text-xl text-[#cdbf9c]">{t("lb.subtitle")}</span>
        <div role="tablist" aria-label={t("lb.title")} className="flex gap-1.5">
          {(
            [
              ["mine", t("lb.tab_mine")],
              ["general", t("lb.tab_general")],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={pane === id}
              data-on={pane === id}
              onClick={() => setPane(id)}
              className="lb-tab font-pixel"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`text-2xl ${message.error ? "text-[#f39a8c]" : "text-[#7fc45a]"}`}
        >
          {message.text}
        </p>
      )}

      {pane === "mine" && (
        <>
          {me?.rewards.map((reward) => (
            <section key={reward.id} className="lb-reward" aria-label={t("lb.reward_box")}>
              <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
                <h2 className="font-pixel text-[10px] text-[#ffe08a]">{t("lb.reward_box")}</h2>
                <span className="text-[21px]">
                  {reward.kind === "wins"
                    ? t("lb.reward_wins", {
                        place: place(reward.rank),
                        league: leagueName(reward.league),
                        date: formatDate(lang, `${reward.weekStart}T12:00:00`),
                      })
                    : t("lb.reward_wpm", {
                        date: formatDate(lang, `${reward.weekStart}T12:00:00`),
                      })}
                </span>
              </div>
              <div
                className="flex gap-2"
                aria-label={t("lb.reward_gives", {
                  list: [
                    reward.xp > 0 ? `${formatNumber(lang, reward.xp)} XP` : null,
                    reward.items.length > 0 ? itemsText(reward.items) : null,
                    reward.boost > 0 ? t("lb.reward_boost", { boost: pct(reward.boost) }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                })}
              >
                {reward.xp > 0 && (
                  <span className="lb-cell">
                    <ItemIcon item="xp_bottle" className="h-10 w-10" />
                    <span className="lb-qty font-pixel">{reward.xp}</span>
                  </span>
                )}
                {reward.items.map((i) => (
                  <span key={i.item} className="lb-cell">
                    <ItemIcon item={i.item} className="h-10 w-10" />
                    {i.count > 1 && <span className="lb-qty font-pixel">{i.count}</span>}
                  </span>
                ))}
                {reward.boost > 0 && (
                  <span className="lb-cell flex-col">
                    <span className="font-pixel text-[9px] text-[#7fc45a]">
                      +{pct(reward.boost)}
                    </span>
                    <span className="text-[15px] text-[#a8966e]">7 j</span>
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void claim(reward.id)}
                className="lb-claim font-pixel"
              >
                {t("lb.claim")}
              </button>
            </section>
          ))}

          {me &&
            ((me.lastMove && me.lastMove.to !== me.lastMove.from) ||
              (me.boost > 0 && me.boostUntil)) && (
              <div className="lobby-panel flex flex-col gap-1 px-5 py-3 text-2xl">
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
              </div>
            )}
          {!me && (
            <div className="lobby-panel px-5 py-4 text-2xl">
              <p className="mb-3">{t("lb.guest")}</p>
              <PixelButton href="/connexion" className="h-11 px-5 text-[10px]">
                {t("home.account")}
              </PixelButton>
            </div>
          )}

          <section className="lobby-panel" aria-labelledby="ladder">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#3b2a1a] px-5 py-3.5">
              <h2 id="ladder" className="font-pixel text-[11px] text-white">
                {t("lb.classes")}
              </h2>
              <span className="text-xl text-[#a8966e]">
                {t("lb.classes_rule", { up: view.week.up, down: view.week.down })}
              </span>
            </div>
            <ol className="lb-ladder" aria-label={t("lb.league_pick")}>
              {[0, 1, 2, 3, 4].map((l) => (
                <li key={l} className="contents">
                  {l > 0 && (
                    <span
                      className={`lb-link ${myLeague != null && l <= myLeague ? "lb-lit" : ""}`}
                      aria-hidden="true"
                    />
                  )}
                  <button
                    type="button"
                    aria-pressed={league === l}
                    onClick={() => pickLeague(l)}
                    className={`lb-lg ${myLeague != null && l < myLeague ? "lb-done" : ""} ${myLeague === l ? "lb-here" : ""} ${league === l ? "lb-picked" : ""}`}
                    style={{ ["--c" as string]: LEAGUE_COLORS[l] }}
                  >
                    {myLeague === l && (
                      <span className="lb-you font-pixel">{t("lb.you_here")}</span>
                    )}
                    <span className="lb-lgic">
                      <ItemIcon item={LEAGUE_ITEM[l]!} className="h-11 w-11" />
                    </span>
                    <span className="lb-lgn font-pixel">{leagueName(l).toUpperCase()}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <div className="flex flex-wrap items-start gap-7">
            <section className="lobby-panel min-w-0 flex-[999_1_620px]" aria-labelledby="semaine">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#3b2a1a] px-5 py-3.5">
                <h2 id="semaine" className="font-pixel text-[11px] text-white">
                  {t("lb.week_of", { league: leagueName(league).toUpperCase() })}
                </h2>
                <span className="flex items-center gap-2 text-xl text-white">
                  <i className="lobby-live" aria-hidden="true" />
                  {t("lb.ends_short", { time: ends })}
                </span>
              </div>
              {progress && <p className="px-5 pt-3 text-xl text-[#7fc45a]">{progress}</p>}
              <div role="table" aria-label={t("lb.week_of", { league: leagueName(league) })}>
                <div role="row" className="lb-cols lb-thead font-pixel">
                  <span role="columnheader">#</span>
                  <span role="columnheader">{t("lb.col_player").toUpperCase()}</span>
                  <span role="columnheader">{t("lb.col_wins").toUpperCase()}</span>
                  <span role="columnheader">{t("lb.best")}</span>
                  <span role="columnheader" className="text-right">
                    {t("lb.zone")}
                  </span>
                </div>
                {rows.length === 0 && <p className="px-5 py-4 text-xl">{t("lb.empty")}</p>}
                {rows.map((row, i) => {
                  const up =
                    row.position <= view.week.up && row.wins >= view.week.minWins && league < 4;
                  const down =
                    league > 0 &&
                    view.week.down > 0 &&
                    row.position > rows.length - view.week.down &&
                    row.position > view.week.up;
                  const next = rows[i + 1];
                  const nextDown =
                    !!next &&
                    league > 0 &&
                    view.week.down > 0 &&
                    next.position > rows.length - view.week.down &&
                    next.position > view.week.up;
                  return (
                    <div key={row.userId} className="contents">
                      <div
                        role="row"
                        className={`lb-cols lb-row ${me?.userId === row.userId ? "lb-me" : ""}`}
                      >
                        <span role="cell" className="font-pixel text-xs text-[#a8966e]">
                          {row.position}
                        </span>
                        <span role="cell" className="min-w-0">
                          {who(row)}
                        </span>
                        <span
                          role="cell"
                          className="lb-wins"
                          aria-label={t("lb.wins_aria", { n: row.wins })}
                        >
                          {Array.from({ length: 5 }, (_, k) => (
                            <span key={k} data-on={k < row.wins} aria-hidden="true" />
                          ))}
                          <b aria-hidden="true">{row.wins}</b>
                        </span>
                        <span role="cell" className="text-2xl text-white">
                          {formatNumber(lang, Math.round(row.bestWpm))}{" "}
                          <span className="text-[17px] text-[#a8966e]">{t("race.wpm")}</span>
                        </span>
                        <span role="cell" className="font-pixel text-right text-[8px]">
                          {up && <span className="text-[#7fc45a]">{t("lb.zone_up")}</span>}
                          {down && <span className="text-[#f39a8c]">{t("lb.zone_down")}</span>}
                        </span>
                      </div>
                      {row.position === view.week.up && i < rows.length - 1 && league < 4 && (
                        <div className="lb-sep font-pixel">{t("lb.line_up")}</div>
                      )}
                      {!down && nextDown && (
                        <div className="lb-sep font-pixel">{t("lb.line_down")}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <aside className="lobby-panel min-w-0 flex-[1_1_320px]" aria-labelledby="prix">
              <div className="border-b-2 border-[#3b2a1a] px-5 py-3.5">
                <h2 id="prix" className="font-pixel text-[11px] text-white">
                  {t("lb.prizes")}
                </h2>
              </div>
              <ol className="flex flex-col gap-2.5 px-5 py-4.5">
                {prizes.map((prize, i) => (
                  <li key={i} className="lb-prize">
                    <span
                      className="hist-medal font-pixel"
                      style={{ background: ["#f0b429", "#c6c6c6", "#c98e58"][i], color: "#1b1209" }}
                    >
                      {i + 1}
                    </span>
                    <span className="flex flex-auto flex-col">
                      <span className="text-[22px] text-white">
                        {formatNumber(lang, prize.xp)} XP
                      </span>
                      <span className="text-lg text-[#a8966e]">
                        {t("lb.prize_boost", { boost: pct(prize.boost) })}
                      </span>
                    </span>
                    {prize.items.map((it) => (
                      <span key={it.item} className="relative" title={itemName(t, it.item)}>
                        <ItemIcon item={it.item} className="h-9 w-9" />
                        <span className="lb-qty font-pixel">{it.count}</span>
                      </span>
                    ))}
                  </li>
                ))}
              </ol>
              <p className="px-5 text-[19px] text-[#a8966e]">
                {t("lb.prize_other", { boost: pct(view.prizes.otherBoost[league] ?? 0) })}
              </p>
              <p className="px-5 pb-4.5 text-[19px] text-[#a8966e]">
                {t("lb.min_wins_note", { min: view.week.minWins })}
              </p>
            </aside>
          </div>

          <section className="lobby-panel" aria-labelledby="last">
            <div className="border-b-2 border-[#3b2a1a] px-5 py-3.5">
              <h2 id="last" className="font-pixel text-[11px] text-white">
                {t("lb.last_week")}
              </h2>
            </div>
            <div className="px-5 py-4">
              {view.lastWeek.length === 0 ? (
                <p className="text-xl">{t("lb.last_week_none")}</p>
              ) : (
                <div className="flex flex-wrap gap-6 text-xl">
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
            </div>
          </section>
        </>
      )}

      {pane === "general" && (
        <section className="lobby-panel" aria-labelledby="gen">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#3b2a1a] px-5 py-3.5">
            <h2 id="gen" className="font-pixel text-[11px] text-white">
              {t("lb.general")}
            </h2>
            <div role="tablist" aria-label={t("lb.general")} className="flex flex-wrap gap-1.5">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`lb-tab-${item.id}`}
                  aria-selected={tab === item.id}
                  aria-controls="lb-board"
                  data-on={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className="lobby-filter font-pixel"
                >
                  {t(item.label)}
                </button>
              ))}
            </div>
          </div>
          <div id="lb-board" role="tabpanel" aria-labelledby={`lb-tab-${tab}`}>
            <div role="table" aria-label={t("lb.general")}>
              <div role="row" className="lb-gcols lb-thead font-pixel">
                <span role="columnheader">{t("lb.col_rank").toUpperCase()}</span>
                <span role="columnheader">{t("lb.col_player").toUpperCase()}</span>
                <span role="columnheader">{t("lb.col_level").toUpperCase()}</span>
                <span role="columnheader">{t("lb.col_wpm").toUpperCase()}</span>
                <span role="columnheader">{t("lb.col_wins").toUpperCase()}</span>
              </div>
              {view.boards[tab].map((row) => (
                <div
                  key={row.userId}
                  role="row"
                  className={`lb-gcols lb-row ${me?.userId === row.userId ? "lb-me" : ""}`}
                >
                  <span role="cell">
                    <span
                      className="hist-medal font-pixel"
                      style={{
                        background:
                          ["#f0b429", "#c6c6c6", "#c98e58"][row.position - 1] ?? "#2b1e13",
                        color: row.position <= 3 ? "#1b1209" : "#a8966e",
                      }}
                    >
                      {row.position}
                    </span>
                  </span>
                  <span role="cell" className="min-w-0">
                    {who(row)}
                  </span>
                  <span role="cell" className="text-2xl text-[#ffe08a]">
                    {levelFromXp(row.xp).level}
                  </span>
                  <span role="cell" className="text-2xl text-white">
                    {formatNumber(lang, Math.round(row.bestWpm))}
                  </span>
                  <span role="cell" className="text-2xl text-white">
                    {row.wins}
                  </span>
                </div>
              ))}
              {view.boards[tab].length === 0 && (
                <p className="px-5 py-4 text-xl">{t("lb.empty")}</p>
              )}
              <p className="px-5 py-3 text-lg text-[#a8966e]">{t("lb.live")}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
