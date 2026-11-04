import { PixelShell } from "@/components/PixelShell";
import Link from "next/link";
import { PixelAvatar, PixelKeyboard } from "@/components/ui";
import { identicon } from "@/lib/identicon";
import { levelFromXp } from "@/lib/xp";
import { weakestKeys } from "@/lib/weak-keys";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import { loadHistory } from "@/lib/history";
import { loadProfileStats } from "@/lib/stats";
import { HistoryTableRow } from "@/components/history/HistoryTableRow";
import { ProgressChart } from "@/components/ProgressChart";
import { ProfileEditor } from "@/components/ProfileEditor";
import { getRequestLang, pageMetadata } from "@/lib/i18n-server";
import { translate, type DictKey } from "@/lib/i18n-dictionary";
import { GuestProfile } from "@/components/GuestProfile";
import { LogoutButton } from "@/components/LogoutButton";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { keyStats, raceParticipants, users } from "@/db/schema";
import { peekIdentity } from "@/lib/auth/identity";
import { heatmapRowsFromCounts } from "@/lib/heatmap";

// Nombre de courses récentes affichées dans Stats ; la page Historique les montre toutes.
const RECENT_RACES = 5;

/** Couleur de la pastille de chaque classe (bronze → netherite). */
const LEAGUE_COLOR = ["#9a6b3a", "#8b8b8b", "#f0b429", "#45cfc8", "#4a3f4a"];

export const dynamic = "force-dynamic";
export const generateMetadata = pageMetadata("title.profile");

export default async function ProfilPage() {
  const [identity, lang] = await Promise.all([peekIdentity(), getRequestLang()]);
  const t = (key: DictKey, params?: Record<string, string | number>) =>
    translate(lang, key, params);

  if (!identity || identity.kind !== "user") {
    return (
      <PixelShell active="stats">
        <h1 className="font-pixel mb-6 text-xl text-white [text-shadow:4px_4px_0_#000]">
          {t("guest.title")}
        </h1>
        <GuestProfile />
      </PixelShell>
    );
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, identity.userId) });
  if (!user) throw new Error("compte introuvable");

  const stats = await loadProfileStats(identity.userId);

  const keyRows = await db.query.keyStats.findMany({
    columns: { char: true, correct_count: true, error_count: true },
    where: eq(keyStats.user_id, identity.userId),
  });
  const correct: Record<string, number> = {};
  const errors: Record<string, number> = {};
  for (const k of keyRows) {
    correct[k.char] = k.correct_count;
    errors[k.char] = k.error_count;
  }
  const heatmapRows = heatmapRowsFromCounts(correct, errors);

  // Progression : toute course réellement courue (terminée ou arrêtée par le temps) a un MPM ;
  // seuls les abandons n'en ont pas de significatif.
  const progression = await db.query.raceParticipants.findMany({
    columns: { wpm: true, created_at: true },
    where: and(
      eq(raceParticipants.user_id, identity.userId),
      eq(raceParticipants.role, "participant"),
      inArray(raceParticipants.status, ["finished", "timeout"]),
      isNotNull(raceParticipants.wpm),
    ),
    orderBy: desc(raceParticipants.created_at),
    limit: 20,
  });
  const points = [...progression]
    .reverse()
    .map((p) => ({ wpm: p.wpm ?? 0, at: new Date(p.created_at) }));

  // Les mêmes cartes que la page Historique (mêmes infos, mêmes actions) : les plus récentes seulement.
  const history = (await loadHistory(identity.userId, { section: "all", page: 1 })).rows.slice(
    0,
    RECENT_RACES,
  );

  const lv = levelFromXp(user.xp_total);
  const winPct = stats.races > 0 ? Math.round((stats.wins / stats.races) * 100) : 0;
  const weak = weakestKeys(keyRows, 3);
  const leagueName = t(`league.${user.league}` as DictKey);
  const maxPt = Math.max(1, ...points.map((p) => p.wpm));
  const lastBars = points.slice(-8);
  const streak = user.current_streak_days;
  const avatarColor = identicon(user.display_name).color;

  return (
    <PixelShell active="stats">
      <div className="flex flex-col gap-7">
        <section className="lobby-panel prof-hero" aria-labelledby="nom">
          <span className="prof-avatar">
            <PixelAvatar
              label={user.display_name[0]?.toUpperCase() ?? "?"}
              color={avatarColor}
              src={user.avatar_url}
              seed={user.display_name}
              className="h-full w-full border-0 text-4xl"
            />
            <span className="prof-lvl font-pixel">{lv.level}</span>
          </span>
          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-3.5">
              <h1
                id="nom"
                className="font-pixel text-2xl break-all text-white [text-shadow:4px_4px_0_#000]"
              >
                {user.display_name.toUpperCase()}
              </h1>
              <span className="prof-class font-pixel">
                <span style={{ background: LEAGUE_COLOR[user.league] ?? "#8b8b8b" }} />
                {t("profile.class", { name: leagueName.toUpperCase() })}
              </span>
            </div>
            <div className="flex max-w-[460px] items-center gap-3">
              <span className="font-pixel text-[8px] text-[#7fc45a]">
                {t("res.level_short", { level: lv.level })}
              </span>
              <div
                className="prof-xp flex-auto"
                role="img"
                aria-label={t("xp.aria", {
                  level: lv.level,
                  into: lv.intoLevel,
                  needed: lv.needed,
                })}
              >
                <span style={{ width: `${Math.round(lv.fraction * 100)}%` }} />
              </div>
              <span className="text-[19px] whitespace-nowrap text-[#cdbf9c]">
                {t("res.xp_progress", { into: lv.intoLevel, needed: lv.needed })}
              </span>
            </div>
            <span className="text-[19px] text-[#a8966e]">
              {t("profile.member_since", { date: formatDate(lang, user.created_at) })}
            </span>
            <details className="prof-edit">
              <summary className="prof-edit-btn font-pixel">{t("profile.edit_open")}</summary>
              <div className="ui-dark mt-3">
                <ProfileEditor
                  displayName={user.display_name}
                  hasPhoto={user.avatar_source === "upload" && user.avatar_url !== null}
                />
              </div>
            </details>
          </div>
          <div className="prof-stats">
            <Link href="/historique" className="hist-tile">
              <span className="font-pixel text-[8px] text-[#ffe08a]">{t("profile.best")}</span>
              <span className="hist-num text-[#f0b429]">
                {formatNumber(lang, Math.round(stats.bestWpm))} <small>{t("race.wpm")}</small>
              </span>
              <span className="prof-bars" aria-hidden="true">
                {lastBars.map((p, i) => (
                  <span
                    key={i}
                    style={{
                      height: `${Math.max(10, Math.round((p.wpm / maxPt) * 100))}%`,
                      ...(i === lastBars.length - 1 ? { background: "#f0b429" } : {}),
                    }}
                  />
                ))}
              </span>
            </Link>
            <Link href="/historique" className="hist-tile">
              <span className="font-pixel text-[8px] text-[#ffe08a]">{t("profile.average")}</span>
              <span className="hist-num">
                {stats.avgWpm != null ? formatNumber(lang, Math.round(stats.avgWpm)) : "—"}{" "}
                <small>{t("race.wpm")}</small>
              </span>
            </Link>
            <a href="#clavier" className="hist-tile">
              <span className="font-pixel text-[8px] text-[#ffe08a]">{t("profile.accuracy")}</span>
              <span className="hist-num">
                {stats.avgAccuracy != null ? formatPercent(lang, stats.avgAccuracy, 1) : "—"}
              </span>
              <span className="prof-seg" aria-hidden="true">
                {Array.from({ length: 10 }, (_, i) => (
                  <span key={i} data-on={i < Math.round((stats.avgAccuracy ?? 0) / 10)} />
                ))}
              </span>
              <span className="hist-more font-pixel">{t("profile.t_keyboard")}</span>
            </a>
            <Link href="/historique" className="hist-tile">
              <span className="font-pixel text-[8px] text-[#ffe08a]">{t("profile.races")}</span>
              <span className="hist-num">{formatNumber(lang, stats.races)}</span>
              <span className="hist-more font-pixel">{t("profile.t_records")}</span>
            </Link>
            <Link href="/historique" className="hist-tile">
              <span className="font-pixel text-[8px] text-[#ffe08a]">{t("profile.wins")}</span>
              <span className="hist-num text-[#f0b429]">{formatNumber(lang, stats.wins)}</span>
              <span className="hist-cups" aria-hidden="true">
                {Array.from({ length: 5 }, (_, i) => (
                  <i key={i} data-on={i < Math.min(5, stats.wins)} />
                ))}
              </span>
              <span className="hist-more font-pixel">
                {t("profile.t_wins_sub", { pct: formatPercent(lang, winPct) })}
              </span>
            </Link>
            <Link href="/historique" className="hist-tile">
              <span className="font-pixel text-[8px] text-[#ffe08a]">{t("profile.streak")}</span>
              <span className="hist-num">
                {streak} <small>{streak > 1 ? t("profile.days") : t("profile.day")}</small>
              </span>
              <span className="hist-more font-pixel">
                {t("profile.t_streak_sub", { next: streak + 1 })}
              </span>
            </Link>
          </div>
        </section>

        <div className="flex flex-wrap items-stretch gap-7">
          <section className="lobby-panel min-w-0 flex-[999_1_560px]" aria-labelledby="prog">
            <div className="lobby-head flex flex-wrap items-center justify-between gap-3 !py-3.5">
              <h2
                id="prog"
                className="font-pixel text-[11px] text-white [text-shadow:3px_3px_0_#000]"
              >
                {t("profile.progress_title")}
              </h2>
              <span className="text-xl text-white">
                {t("profile.progress_sub", { count: points.length })}
              </span>
            </div>
            <div className="p-4">
              {points.length > 0 ? (
                <ProgressChart
                  data={points}
                  lang={lang}
                  label={t("profile.progress_aria")}
                  averageLabel={t("profile.progress_average")}
                  wpmLabel={t("race.wpm")}
                />
              ) : (
                <p className="p-6 text-center text-2xl text-[#a8966e]">
                  {t("profile.progress_empty")}
                </p>
              )}
            </div>
          </section>
          <section className="lobby-panel min-w-0 flex-[1_1_320px]" aria-labelledby="touches">
            <div className="border-b-2 border-[#3b2a1a] px-5 py-3.5">
              <h2 id="touches" className="font-pixel text-[11px] text-white">
                {t("profile.work_title")}
              </h2>
            </div>
            <ol className="flex flex-col gap-3.5 p-5">
              {weak.length === 0 && (
                <li className="text-xl text-[#cdbf9c]">{t("home.tile_no_keys")}</li>
              )}
              {weak.map((k, i) => {
                const pct = Math.round((1 - k.rate) * 100);
                const bg = i === 0 ? "#b0281c" : "#c97a2a";
                return (
                  <li key={k.key} className="flex items-center gap-3">
                    <span className="prof-cap font-pixel" style={{ background: bg }}>
                      {k.key.toUpperCase()}
                    </span>
                    <span className="flex-auto">
                      <span className="flex justify-between text-[21px]">
                        <span>{formatPercent(lang, pct)}</span>
                        <span className="text-[#a8966e]">{t("profile.work_rate")}</span>
                      </span>
                      <span className="prof-pbar">
                        <span style={{ width: `${pct}%`, background: bg }} />
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <details className="lobby-panel room-details prof-kbd" id="clavier">
          <summary className="flex items-center justify-between gap-3 border-b-2 border-[#3b2a1a] px-5 py-3.5">
            <span className="flex items-center gap-3">
              <span className="settings-adv-chev font-pixel" aria-hidden="true">
                &gt;
              </span>
              <h2 className="font-pixel text-[11px] text-white">{t("profile.keyboard_title")}</h2>
            </span>
            <span className="prof-kbtog font-pixel">
              <span className="prof-open">{t("profile.show")}</span>
              <span className="prof-close">{t("profile.hide")}</span>
            </span>
          </summary>
          <div className="overflow-x-auto p-5">
            <PixelKeyboard rows={heatmapRows} label={t("res.heatmap")} />
            <p className="mt-2 text-lg text-[#a8966e]">{t("res.heatmap_legend")}</p>
          </div>
        </details>

        <section className="lobby-panel" aria-labelledby="histo">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#3b2a1a] px-5 py-3.5">
            <h2 id="histo" className="font-pixel text-[11px] text-white">
              {t("profile.recent")}
            </h2>
            <Link
              href="/historique"
              className="room-lift font-pixel flex h-[38px] items-center bg-[#f0b429] px-3 text-[8px] text-[#1b1209]"
            >
              {t("profile.all_history")}
            </Link>
          </div>
          {history.length === 0 ? (
            <p className="px-5 py-4 text-xl text-[#cdbf9c]">{t("profile.history_empty")}</p>
          ) : (
            <div role="table" aria-label={t("profile.recent")}>
              <div role="row" className="hist-cols hist-thead font-pixel">
                <span role="columnheader">{t("hist.c_date")}</span>
                <span role="columnheader">{t("hist.c_rank")}</span>
                <span role="columnheader">{t("hist.c_wpm")}</span>
                <span role="columnheader">{t("hist.c_acc")}</span>
                <span role="columnheader">{t("hist.c_winner")}</span>
                <span role="columnheader">{t("hist.c_status")}</span>
                <span role="columnheader">
                  <span className="sr-only">{t("hist.c_actions")}</span>
                </span>
              </div>
              {history.map((h, i) => (
                <HistoryTableRow key={h.raceId} row={h} lang={lang} index={i} />
              ))}
            </div>
          )}
        </section>

        <div className="flex justify-end">
          <LogoutButton />
        </div>
      </div>
    </PixelShell>
  );
}
