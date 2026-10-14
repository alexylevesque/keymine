import { PixelShell } from "@/components/PixelShell";
import { participantName } from "@/lib/bot-name";
import { PixelAvatar, PixelDisclosure, PixelKeyboard, PixelPanel } from "@/components/ui";
import { ResultsActions } from "@/components/results/ResultsActions";
import { WpmChart } from "@/components/results/WpmChart";
import { HIDDEN_FIRST_SECONDS } from "@/components/results/chart-config";
import { peekIdentity } from "@/lib/auth/identity";
import { formatNumber, formatPercent, formatRaceTime } from "@/lib/format";
import { heatmapRowsFromCounts } from "@/lib/heatmap";
import { getRequestLang, pageMetadata } from "@/lib/i18n-server";
import { translate, type DictKey, type SiteLang } from "@/lib/i18n-dictionary";
import { db } from "@/lib/db";
import { getLobbyByCode, isHost } from "@/lib/lobby";
import {
  isPersonalRecord,
  latestFinishedRaceId,
  loadRaceResults,
  type ResultRow,
} from "@/lib/results";

export const dynamic = "force-dynamic";
export const generateMetadata = pageMetadata("title.results");

const PODIUM_STYLE = [
  {
    height: "h-44",
    bg: "bg-[#f0b429]",
    text: "text-[#1b1e13]",
    size: "text-4xl",
    avatar: "h-14 w-14 text-2xl",
    label: "1",
  },
  {
    height: "h-32",
    bg: "bg-[#a8a8a8]",
    text: "text-[#1b1b1b]",
    size: "text-3xl",
    avatar: "h-13 w-13 text-xl",
    label: "2",
  },
  {
    height: "h-24",
    bg: "bg-[#9a6b3c]",
    text: "text-white",
    size: "text-2xl",
    avatar: "h-13 w-13 text-xl",
    label: "3",
  },
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

function bonusSummary(lang: SiteLang, row: ResultRow): string {
  if (row.bonuses.length === 0) return translate(lang, "res.bonus_none");
  return row.bonuses.map((b) => translate(lang, BONUS_KEY[b.kind])).join(", ");
}

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
    const avg = await db
      .selectFrom("race_participants")
      .select((eb) => eb.fn.avg<number>("wpm").as("avg_wpm"))
      .where("user_id", "=", me.userId)
      .where("status", "=", "finished")
      .where("race_id", "!=", results.race.id)
      .executeTakeFirst();
    avgWpm = avg?.avg_wpm != null ? Number(avg.avg_wpm) : null;
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

  return (
    <PixelShell active="lobbys">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-pixel text-xl text-white [text-shadow:4px_4px_0_#000]">
          {t("res.title")}
        </h1>
        <span className="text-2xl text-[#f1e6c9]">
          {t("res.room_meta", { code, count: rows.length })}
        </span>
      </div>

      <div className="flex flex-col gap-7 lg:flex-row lg:items-start">
        <div className="flex w-full flex-col gap-6 lg:w-[32rem] lg:flex-none">
          <PixelPanel className="p-5">
            <h2 className="font-pixel mb-3.5 text-sm text-[#2b2b2b]">{t("res.podium")}</h2>
            <ol className="flex h-72 items-end justify-center gap-2.5">
              {[podium[1], podium[0], podium[2]].map((p, i) => {
                const place = [1, 0, 2][i]!;
                const style = PODIUM_STYLE[place]!;
                if (!p) return <li key={i} aria-hidden="true" className="w-36" />;
                return (
                  <li key={p.id} className="flex w-36 flex-col items-center gap-1">
                    <PixelAvatar
                      label={participantName(t, p)[0]?.toUpperCase() ?? "?"}
                      color={p.isBot ? "#555555" : "#3d6fc4"}
                      src={p.avatarUrl}
                      seed={p.isBot ? null : p.name}
                      className={style.avatar}
                    />
                    <div className="max-w-full truncate text-2xl leading-none">{p.name}</div>
                    <div className="text-xl leading-none text-[#3a3a3a]">
                      {formatNumber(lang, p.wpm)} {t("race.wpm")}
                    </div>
                    <div
                      className={`font-pixel flex w-full items-center justify-center border-4 border-black ${style.height} ${style.bg} ${style.text} ${style.size}`}
                    >
                      <span className="sr-only">{t("res.col_rank")} </span>
                      {style.label}
                    </div>
                  </li>
                );
              })}
            </ol>
          </PixelPanel>

          {me && (
            <PixelPanel className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-pixel text-sm text-[#2b2b2b]">{t("res.your_result")}</h2>
                {delta != null && (
                  <span
                    className={`font-pixel border-4 border-black px-2 py-1.5 text-[9px] text-white ${
                      delta >= 0 ? "bg-[#3f7d24]" : "bg-[#9b3a2e]"
                    }`}
                  >
                    {t("res.vs_average", { delta: `${delta >= 0 ? "+" : ""}${delta}` })}
                  </span>
                )}
              </div>
              {record && (
                <p className="font-pixel mt-3 border-4 border-black bg-[#f0b429] px-2 py-2 text-[10px] text-[#1b1e13]">
                  ★ {t("res.record")}
                </p>
              )}
              <div className="mt-3 grid grid-cols-3 gap-2.5">
                <div className="pixel-slot px-3 py-2 leading-none">
                  <div className="font-pixel text-[9px] text-[#ffefb3]">{t("race.speed")}</div>
                  <div className="mt-1 text-4xl text-white">
                    {formatNumber(lang, me.wpm)} {t("race.wpm")}
                  </div>
                </div>
                <div className="pixel-slot px-3 py-2 leading-none">
                  <div className="font-pixel text-[9px] text-[#ffefb3]">{t("race.accuracy")}</div>
                  <div className="mt-1 text-4xl text-white">{formatPercent(lang, me.accuracy)}</div>
                </div>
                <div className="pixel-slot px-3 py-2 leading-none">
                  <div className="font-pixel text-[9px] text-[#ffefb3]">{t("race.errors")}</div>
                  <div className="mt-1 text-4xl text-white">{me.errors}</div>
                </div>
              </div>
            </PixelPanel>
          )}
        </div>

        <div className="flex w-full min-w-0 flex-grow flex-col gap-6">
          <PixelPanel className="p-5">
            <PixelDisclosure title={t("res.ranking")} defaultOpen>
              {/* Sur écran étroit le tableau défile : la zone doit être atteignable au clavier (A11Y-04). */}
              <div className="overflow-x-auto" role="region" aria-label={t("res.ranking")} tabIndex={0}>
                <table className="w-full min-w-[40rem] border-collapse text-left text-xl leading-tight">
                  <caption className="sr-only">{t("res.ranking")}</caption>
                  <thead>
                    <tr>
                      {(
                        [
                          "res.col_rank",
                          "res.col_player",
                          "res.col_wpm",
                          "res.col_raw",
                          "res.col_accuracy",
                          "res.col_errors",
                          "res.col_time",
                          "res.col_status",
                          "res.col_bonus",
                        ] as const
                      ).map((key) => (
                        <th
                          key={key}
                          scope="col"
                          className="font-pixel pr-2.5 pb-2 text-[8px] font-normal text-[#3a3a3a]"
                        >
                          {t(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id} className="border-t-2 border-dotted border-[#8b8b8b]">
                        <th scope="row" className="font-pixel py-1 pr-2.5 text-[11px] font-normal">
                          {p.rank}
                        </th>
                        <td
                          className={`max-w-40 truncate pr-2.5 ${p.ownerKey && p.ownerKey === myKey ? "font-bold" : ""}`}
                        >
                          {participantName(t, p)}
                        </td>
                        <td className="pr-2.5">{formatNumber(lang, p.wpm)}</td>
                        <td className="pr-2.5">{formatNumber(lang, p.rawWpm)}</td>
                        <td className="pr-2.5">{formatPercent(lang, p.accuracy)}</td>
                        <td className="pr-2.5">{p.errors}</td>
                        <td className="pr-2.5">
                          {p.status === "finished" ? formatRaceTime(lang, p.timeMs) : "—"}
                          {p.status === "finished" && p.penaltyMs > 0 && (
                            <span className="block text-base text-[#3a3a3a]">
                              {t("res.penalty_note", {
                                seconds: formatNumber(lang, p.penaltyMs / 1000, 1),
                              })}
                            </span>
                          )}
                        </td>
                        <td className="pr-2.5">{t(STATUS_KEY[p.status] ?? "res.status_other")}</td>
                        <td>{bonusSummary(lang, p)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PixelDisclosure>
          </PixelPanel>

          <PixelPanel className="p-5">
            <PixelDisclosure title={t("res.chart")}>
              <WpmChart
                title={t("res.chart")}
                description={t("res.chart_desc")}
                note={t("res.chart_note", { seconds: HIDDEN_FIRST_SECONDS })}
                showAllLabel={t("res.chart_show_all")}
                xLabel={t("res.chart_x")}
                yLabel={t("res.chart_y")}
                series={rows.map((r) => ({
                  id: r.id,
                  name: `${participantName(t, r)} · ${formatNumber(lang, r.wpm)} ${t("race.wpm")}`,
                  shortName: participantName(t, r),
                  isBot: r.isBot,
                  isMe: r.ownerKey != null && r.ownerKey === myKey,
                  points: r.series,
                }))}
              />
            </PixelDisclosure>
          </PixelPanel>

          {heatmapRows && (
            <PixelPanel className="p-5">
              <PixelDisclosure title={t("res.heatmap")} aside={t("res.heatmap_legend")}>
                <PixelKeyboard rows={heatmapRows} label={t("res.heatmap")} />
                {worstKeys.length > 0 && (
                  <p className="mt-2.5 text-xl">
                    {t("res.worst_keys")}{" "}
                    {worstKeys.map(([letter, pct]) => (
                      <b
                        key={letter}
                        className="mr-1.5 border-2 border-black bg-[#ff7b6b] px-1.5 font-normal"
                      >
                        {letter} ({pct}%)
                      </b>
                    ))}
                  </p>
                )}
              </PixelDisclosure>
            </PixelPanel>
          )}
        </div>
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
