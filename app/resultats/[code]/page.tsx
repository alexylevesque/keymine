import { Crown } from "@/components/leaderboard/badges";
import { ItemIcon } from "@/components/items/ItemIcon";
import { PixelShell } from "@/components/PixelShell";
import { participantName } from "@/lib/bot-name";
import { PixelAvatar, PixelKeyboard } from "@/components/ui";
import { ResultsActions } from "@/components/results/ResultsActions";
import { RefreshOnMount } from "@/components/RefreshOnMount";
import { ReplayChart } from "@/components/results/ReplayChart";
import { peekIdentity } from "@/lib/auth/identity";
import { formatNumber, formatPercent, formatRaceTime } from "@/lib/format";
import { heatmapRowsFromCounts } from "@/lib/heatmap";
import { getRequestLang, pageMetadata } from "@/lib/i18n-server";
import { groupBonuses } from "@/lib/bonus-summary";
import { translate, type DictKey, type SiteLang } from "@/lib/i18n-dictionary";
import { and, avg, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { raceParticipants, users } from "@/db/schema";
import { identicon } from "@/lib/identicon";
import { levelFromXp } from "@/lib/xp";
import { PodiumCrown, Trophy } from "@/components/results/ResultPixels";
import { ResultTabs } from "@/components/results/ResultTabs";
import { getLobbyByCode, isHost } from "@/lib/lobby";
import {
  isPersonalRecord,
  latestFinishedRaceId,
  loadRaceResults,
  type ResultRow,
} from "@/lib/results";

export const dynamic = "force-dynamic";
export const generateMetadata = pageMetadata("title.results");

const AVATAR_COLORS = ["#3d6fc4", "#b03a7a", "#a85512", "#17706f", "#7a45b0", "#3f7d24", "#b63a32"];

/** Marches du podium (1er, 2e, 3e) : hauteur, couleurs, délai de l'animation. */
const PODIUM_STEP = [
  { h: 160, bg: "#f0b429", fg: "#1b1209", delay: 0.4 },
  { h: 110, bg: "#a8a8a8", fg: "#1b1209", delay: 0.2 },
  { h: 76, bg: "#9a6b3a", fg: "#fff", delay: 0 },
];

/** Confettis de la bannière : position (%), couleur, délai et durée (s). */
const CONFETTI: [number, string, number, number][] = [
  [32, "#45cfc8", 0.3, 3.7],
  [63, "#7fc45a", 0.2, 2.7],
  [4, "#f39a8c", 1.7, 3.4],
  [9, "#7fc45a", 1.6, 3.6],
  [37, "#7fc45a", 2.6, 2.8],
  [84, "#45cfc8", 2.5, 3.3],
  [26, "#7fc45a", 0.9, 3.4],
  [82, "#b0281c", 3, 3.6],
  [13, "#ffe08a", 1, 3.7],
  [66, "#7fc45a", 0.5, 3.2],
  [2, "#45cfc8", 1.8, 3.4],
  [78, "#45cfc8", 1.3, 3.9],
  [22, "#7fc45a", 0.9, 3.3],
  [7, "#f0b429", 0.1, 3.9],
];

const STATUS_KEY: Record<string, DictKey> = {
  finished: "res.status_finished",
  timeout: "res.status_timeout",
  abandoned: "res.status_abandoned",
};

const BONUS_KEY = {
  minus_words: "res.bonus_minus_words",
  plus_words: "res.bonus_plus_words",
  fog: "res.bonus_fog",
} as const satisfies Record<string, DictKey>;

function Message({ lang, text }: { lang: SiteLang; text: DictKey }) {
  return (
    <PixelShell active="lobbys">
      <p role="alert" className="font-pixel text-sm text-white">
        {translate(lang, text)}
      </p>
    </PixelShell>
  );
}

export default async function ResultatsPage({
  params,
  searchParams,
}: PageProps<"/resultats/[code]">) {
  const { code } = await params;
  const query = await searchParams;
  const lang = await getRequestLang();
  const t = (key: DictKey, p?: Record<string, string | number>) => translate(lang, key, p);

  const lobby = await getLobbyByCode(code);
  if (!lobby) return <Message lang={lang} text="res.not_found" />;

  // HIST-02 : ?course=<id> rouvre les résultats d'une course passée de cette salle.
  const requested = typeof query.course === "string" ? query.course : null;
  const raceId = requested ?? (await latestFinishedRaceId(lobby.id));
  const results = raceId ? await loadRaceResults(raceId) : null;
  if (!results || results.race.lobbyId !== lobby.id)
    return <Message lang={lang} text="res.not_found" />;
  if (results.race.status !== "finished") return <Message lang={lang} text="res.not_finished" />;

  const identity = await peekIdentity();
  const myKey = identity
    ? identity.kind === "user"
      ? `u:${identity.userId}`
      : `g:${identity.guestId}`
    : null;
  const me = myKey ? (results.rows.find((r) => r.ownerKey === myKey) ?? null) : null;
  const isSpectator = myKey ? results.spectatorKeys.includes(myKey) : false;
  if (!me && !isSpectator) return <Message lang={lang} text="res.not_allowed" />;

  const rows = results.rows;
  const podium = rows.slice(0, 3);

  let avgWpm: number | null = null;
  let record = false;
  if (me?.userId) {
    const [mine] = await db
      .select({ avg_wpm: avg(raceParticipants.wpm) })
      .from(raceParticipants)
      .where(
        and(
          eq(raceParticipants.user_id, me.userId),
          eq(raceParticipants.status, "finished"),
          ne(raceParticipants.race_id, results.race.id),
        ),
      );
    avgWpm = mine?.avg_wpm != null ? Number(mine.avg_wpm) : null;
    record =
      me.status === "finished" && (await isPersonalRecord(me.userId, results.race.id, me.wpm));
  }

  const heatmapRows = me ? heatmapRowsFromCounts(me.keyCorrect, me.keyErrors) : null;
  const worstKeys = heatmapRows
    ? heatmapRows
        .flatMap((r) => r.keys)
        .filter(([, pct]) => pct < 100)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 3)
    : [];

  const roomOpen = lobby.status !== "closed";
  const isCurrentRace = !requested || requested === (await latestFinishedRaceId(lobby.id));
  const host = identity ? isHost(identity, lobby) : false;
  const delta = me && avgWpm != null ? Math.round(me.wpm - avgWpm) : null;

  // Barre d'XP : niveau actuel du compte, la part gagnée dans cette course en vert clair.
  let xpBar: { level: number; into: number; needed: number; gain: number } | null = null;
  if (me?.userId) {
    const [u] = await db.select({ xp: users.xp_total }).from(users).where(eq(users.id, me.userId));
    if (u) {
      const lv = levelFromXp(u.xp);
      xpBar = {
        level: lv.level,
        into: lv.intoLevel,
        needed: lv.needed,
        gain: Math.max(0, me.xp ?? 0),
      };
    }
  }
  const colorOf = (p: ResultRow, i: number) =>
    p.isBot
      ? "#5a4632"
      : p.avatarUrl
        ? AVATAR_COLORS[i % AVATAR_COLORS.length]!
        : identicon(p.name).color;
  const title = !me
    ? t("res.title")
    : me.status === "abandoned"
      ? t("res.place_out")
      : me.rank === 1
        ? t("res.place_first", { count: rows.length })
        : t("res.place", { rank: me.rank, count: rows.length });
  const [placeWord, ...restWords] = title.split(" ");

  return (
    <PixelShell active="lobbys">
      <RefreshOnMount />
      <div className="flex flex-col gap-7">
        <section className="res-hero" aria-labelledby="res-title">
          <span aria-hidden="true">
            {CONFETTI.map(([left, color, delay, dur], i) => (
              <span
                key={i}
                className="res-conf"
                style={{
                  left: `${left}%`,
                  background: color,
                  animationDelay: `${delay}s`,
                  animationDuration: `${dur}s`,
                }}
              />
            ))}
          </span>
          <div className="res-trophy" aria-hidden="true">
            <Trophy />
            <span className="res-spark" style={{ left: 14, top: 4 }} />
            <span className="res-spark" style={{ right: 2, top: 60, animationDelay: ".7s" }} />
            <span className="res-shadow" />
          </div>
          <div className="relative flex min-w-0 flex-[1_1_380px] flex-col gap-3">
            <div className="font-pixel text-[9px] text-[#a8966e]">
              {t("res.meta_line", { code, count: rows.length })}
            </div>
            <h1 id="res-title" className="font-pixel res-title">
              {me && me.status !== "abandoned" ? (
                <>
                  <span className="res-shine">{placeWord}</span> {restWords.join(" ")}
                </>
              ) : (
                title
              )}
            </h1>
            <div className="flex flex-wrap gap-2">
              {record && (
                <span className="res-badge font-pixel bg-[#f0b429] text-[#1b1209]">
                  {t("res.record").replace(/\s*!$/, "")}
                </span>
              )}
              {delta != null && (
                <span
                  className={`res-badge font-pixel text-white ${delta >= 0 ? "bg-[#3f7d24]" : "bg-[#9b3a2e]"}`}
                >
                  {t("res.vs_average", { delta: `${delta >= 0 ? "+" : ""}${delta}` })}
                </span>
              )}
              {me?.xp != null && (
                <span
                  className="res-badge font-pixel bg-[#2b1e13] text-[#7fc45a]"
                  data-testid="xp-cell"
                >
                  {t("res.xp_badge", {
                    sign: me.xp > 0 ? "+" : me.xp < 0 ? "−" : "",
                    xp: formatNumber(lang, Math.abs(me.xp)),
                  })}
                </span>
              )}
              {me?.coal != null && me.coal > 0 && (
                <span className="res-badge font-pixel flex items-center gap-1.5 bg-[#2b1e13] text-white">
                  <ItemIcon item="coal" className="h-4 w-4" />
                  {me.coal === 1 ? t("res.coal_won_one") : t("res.coal_won_many", { n: me.coal })}
                </span>
              )}
            </div>
            {xpBar && (
              <div className="flex max-w-[520px] items-center gap-3">
                <span className="font-pixel text-[9px] text-[#7fc45a]">
                  {t("res.level_short", { level: xpBar.level })}
                </span>
                <div
                  className="res-xpbar flex-auto"
                  role="img"
                  aria-label={t("res.xp_aria", {
                    into: xpBar.into,
                    needed: xpBar.needed,
                    gain: xpBar.gain,
                  })}
                >
                  <span
                    className="res-xp-old"
                    style={{
                      width: `${(Math.max(0, xpBar.into - xpBar.gain) / xpBar.needed) * 100}%`,
                    }}
                  />
                  <span
                    className="res-xp-gain"
                    style={{
                      left: `${(Math.max(0, xpBar.into - xpBar.gain) / xpBar.needed) * 100}%`,
                      width: `${(Math.min(xpBar.into, xpBar.gain) / xpBar.needed) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-[19px] text-[#cdbf9c]">
                  {t("res.xp_progress", { into: xpBar.into, needed: xpBar.needed })}
                </span>
              </div>
            )}
          </div>
          {me && (
            <div className="relative grid flex-[1_1_400px] grid-cols-3 gap-3">
              <div className="race-stat whitespace-nowrap">
                <div className="font-pixel text-[8px] text-[#ffe08a]">{t("race.speed")}</div>
                <div className="text-[40px] leading-none">
                  {formatNumber(lang, me.wpm)} <span className="text-xl">{t("race.wpm")}</span>
                </div>
              </div>
              <div className="race-stat whitespace-nowrap">
                <div className="font-pixel text-[8px] text-[#ffe08a]">{t("race.accuracy")}</div>
                <div className="text-[40px] leading-none">{formatPercent(lang, me.accuracy)}</div>
              </div>
              <div className="race-stat whitespace-nowrap">
                <div className="font-pixel text-[8px] text-[#ffe08a]">{t("race.errors")}</div>
                <div className="text-[40px] leading-none">{me.errors}</div>
              </div>
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-stretch gap-7">
          <section className="lobby-panel flex-[1_1_340px]" aria-labelledby="podium">
            <div className="border-b-2 border-[#3b2a1a] px-5 py-3.5">
              <h2 id="podium" className="font-pixel text-[11px] text-white">
                {t("res.podium")}
              </h2>
            </div>
            <ol className="res-pod">
              {[1, 0, 2].map((place) => {
                const p = podium[place];
                if (!p) return <li key={place} aria-hidden="true" />;
                const step = PODIUM_STEP[place]!;
                return (
                  <li key={p.id} className={place === 0 ? "res-win" : ""}>
                    {place === 0 && <PodiumCrown />}
                    <PixelAvatar
                      label={participantName(t, p)[0]?.toUpperCase() ?? "?"}
                      color={colorOf(p, place)}
                      src={p.avatarUrl}
                      seed={p.isBot ? null : p.name}
                      className="res-av h-11 w-11 text-sm"
                    />
                    <span
                      className="max-w-full truncate leading-none"
                      style={{
                        fontSize: place === 0 ? 22 : 19,
                        color: place === 0 ? "#ffe08a" : undefined,
                      }}
                    >
                      {participantName(t, p)}
                    </span>
                    <span
                      className="res-step font-pixel"
                      style={{
                        height: step.h,
                        background: step.bg,
                        color: step.fg,
                        fontSize: place === 0 ? 22 : 12,
                        animationDelay: `${step.delay}s`,
                      }}
                    >
                      <span className="sr-only">{t("res.col_rank")} </span>
                      {place + 1}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="lobby-panel min-w-0 flex-[999_1_640px]" aria-labelledby="classement">
            <div className="lobby-head flex flex-wrap items-center justify-between gap-3 !py-3.5">
              <h2
                id="classement"
                className="font-pixel text-[11px] text-white [text-shadow:3px_3px_0_#000]"
              >
                {t("res.ranking")}
              </h2>
              <span className="text-xl text-white">
                {t("res.text_words", { count: lobby.text_length })}
              </span>
            </div>
            <div
              className="overflow-x-auto"
              role="region"
              aria-label={t("res.ranking")}
              tabIndex={0}
            >
              <div role="table" aria-label={t("res.ranking")} className="min-w-[640px]">
                <div
                  role="row"
                  className="res-cols font-pixel px-5 py-2.5 text-[7px] text-[#a8966e]"
                >
                  <span role="columnheader">{t("res.col_rank")}</span>
                  <span role="columnheader">{t("res.col_player")}</span>
                  <span role="columnheader">{t("res.col_wpm")}</span>
                  <span role="columnheader">{t("res.col_acc_short")}</span>
                  <span role="columnheader">{t("res.col_time")}</span>
                  <span role="columnheader">{t("res.col_errors")}</span>
                  <span role="columnheader">{t("res.col_bonus_taken")}</span>
                </div>
                {rows.map((p, i) => {
                  const mine = p.ownerKey != null && p.ownerKey === myKey;
                  const groups = groupBonuses(p.bonuses);
                  return (
                    <div
                      key={p.id}
                      role="row"
                      className={`res-cols res-row ${mine ? "res-me" : ""}`}
                    >
                      <span
                        role="cell"
                        className="font-pixel text-[11px]"
                        style={{ color: p.rank === 1 ? "#f0b429" : "#a8966e" }}
                      >
                        {p.rank}
                      </span>
                      <span role="cell" className="flex min-w-0 items-center gap-2.5">
                        <PixelAvatar
                          label={participantName(t, p)[0]?.toUpperCase() ?? "?"}
                          color={colorOf(p, i)}
                          src={p.avatarUrl}
                          seed={p.isBot ? null : p.name}
                          className="h-[30px] w-[30px] flex-none text-[10px]"
                        />
                        <span className="truncate text-[23px] text-white">
                          {participantName(t, p)}
                        </span>
                        {p.champion !== null && <Crown league={p.champion} />}
                      </span>
                      <span role="cell" className="text-[26px] text-white">
                        {formatNumber(lang, p.wpm)}
                      </span>
                      <span role="cell">{formatPercent(lang, p.accuracy)}</span>
                      <span role="cell" className="whitespace-nowrap">
                        {p.status === "finished"
                          ? formatRaceTime(lang, p.timeMs)
                          : t(STATUS_KEY[p.status] ?? "res.status_other")}
                        {p.status === "finished" && p.penaltyMs > 0 && (
                          <span className="block text-base text-[#a8966e]">
                            {t("res.penalty_note", {
                              seconds: formatNumber(lang, p.penaltyMs / 1000, 1),
                            })}
                          </span>
                        )}
                      </span>
                      <span role="cell">{p.errors}</span>
                      <span role="cell" className="flex flex-wrap gap-1">
                        {groups.length === 0 ? (
                          <span className="text-[#5a4632]">{t("res.bonus_none")}</span>
                        ) : (
                          groups.map(({ kind, count }) => (
                            <span key={kind} className="res-chip font-pixel">
                              {t(BONUS_KEY[kind]).toUpperCase()}
                              {count > 1 ? ` X${count}` : ""}
                            </span>
                          ))
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        <ResultTabs
          tabs={[
            {
              id: "replay",
              label: t("res.tab_replay"),
              legend: t("res.tab_replay_legend"),
              content: (
                <ReplayChart
                  label={t("res.replay_aria")}
                  placeLabel={(rank) =>
                    (rank === 1 ? t("lb.place_1") : t("lb.place_n", { n: rank })).toUpperCase()
                  }
                  tipLabel={(name, pct, rank, wpm) =>
                    t("res.replay_tip", {
                      name,
                      pct,
                      place: rank === 1 ? t("lb.place_1") : t("lb.place_n", { n: rank }),
                      wpm: wpm == null ? "—" : formatNumber(lang, Math.round(wpm)),
                    })
                  }
                  series={rows.map((r) => ({
                    id: r.id,
                    name: participantName(t, r),
                    isMe: r.ownerKey != null && r.ownerKey === myKey,
                    rank: r.rank,
                    progress: r.progress,
                    textLength: r.textLength,
                    points: r.series,
                  }))}
                />
              ),
            },
            ...(heatmapRows
              ? [
                  {
                    id: "keyboard",
                    label: t("res.tab_keyboard"),
                    legend: t("res.tab_keyboard_legend"),
                    content: (
                      <>
                        <PixelKeyboard rows={heatmapRows} label={t("res.heatmap")} />
                        {worstKeys.length > 0 && (
                          <p className="mt-2.5 text-xl">
                            {t("res.worst_keys")}{" "}
                            {worstKeys.map(([letter, pct]) => (
                              <b
                                key={letter}
                                className="mr-1.5 border-2 border-black bg-[#b0281c] px-1.5 font-normal text-white"
                              >
                                {letter} ({formatPercent(lang, pct)})
                              </b>
                            ))}
                          </p>
                        )}
                      </>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </div>

      <ResultsActions
        code={code}
        isHost={host}
        hasHistory={identity?.kind === "user"}
        roomOpen={roomOpen && isCurrentRace && lobby.status === "finished"}
      />
    </PixelShell>
  );
}
