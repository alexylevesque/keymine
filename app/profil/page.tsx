import { PixelShell } from "@/components/PixelShell";
import { PixelAvatar, PixelButton, PixelKeyboard, PixelSlot } from "@/components/ui";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import { loadHistory } from "@/lib/history";
import { loadProfileStats } from "@/lib/stats";
import { HistoryCard } from "@/components/history/HistoryCard";
import { ProgressChart } from "@/components/ProgressChart";
import { ProfileEditor } from "@/components/ProfileEditor";
import { XpBar } from "@/components/XpBar";
import { getRequestLang, pageMetadata } from "@/lib/i18n-server";
import { translate, type DictKey } from "@/lib/i18n-dictionary";
import { GuestProfile } from "@/components/GuestProfile";
import { LogoutButton } from "@/components/LogoutButton";
import { kysely as db } from "@/lib/db";
import { peekIdentity } from "@/lib/auth/identity";
import { heatmapRowsFromCounts } from "@/lib/heatmap";

// Nombre de courses récentes affichées dans Stats ; la page Historique les montre toutes.
const RECENT_RACES = 5;

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

  const user = await db
    .selectFrom("users")
    .selectAll()
    .where("id", "=", identity.userId)
    .executeTakeFirstOrThrow();

  const stats = await loadProfileStats(identity.userId);

  const keyStats = await db
    .selectFrom("key_stats")
    .select(["char", "correct_count", "error_count"])
    .where("user_id", "=", identity.userId)
    .execute();
  const correct: Record<string, number> = {};
  const errors: Record<string, number> = {};
  for (const k of keyStats) {
    correct[k.char] = k.correct_count;
    errors[k.char] = k.error_count;
  }
  const heatmapRows = heatmapRowsFromCounts(correct, errors);

  // Progression : toute course réellement courue (terminée ou arrêtée par le temps) a un MPM ;
  // seuls les abandons n'en ont pas de significatif.
  const progression = await db
    .selectFrom("race_participants")
    .select(["wpm", "created_at"])
    .where("user_id", "=", identity.userId)
    .where("role", "=", "participant")
    .where("status", "in", ["finished", "timeout"])
    .where("wpm", "is not", null)
    .orderBy("created_at", "desc")
    .limit(20)
    .execute();
  const points = [...progression]
    .reverse()
    .map((p) => ({ wpm: p.wpm ?? 0, at: new Date(p.created_at) }));

  // Les mêmes cartes que la page Historique (mêmes infos, mêmes actions) : les plus récentes seulement.
  const history = (await loadHistory(identity.userId, { section: "all", page: 1 })).rows.slice(
    0,
    RECENT_RACES,
  );

  return (
    <PixelShell active="stats">
      <div className="flex flex-col gap-7 lg:flex-row lg:items-start">
        <div className="flex w-full flex-col gap-6 lg:w-80 lg:flex-none">
          <div className="pixel-panel flex flex-col items-center gap-3 p-6">
            <PixelAvatar
              label={user.display_name[0]?.toUpperCase() ?? "?"}
              color="#3d6fc4"
              src={user.avatar_url}
              seed={user.display_name}
              className="h-32 w-32 border-[5px] text-5xl"
            />
            <h1 className="font-pixel text-lg">{user.display_name.toUpperCase()}</h1>
            <XpBar totalXp={user.xp_total} size="lg" className="w-full max-w-72" />
            <p className="text-center text-xl leading-tight text-[#3a3a3a]">
              {t("profile.created", { date: formatDate(lang, user.created_at) })}
            </p>
            <ProfileEditor
              displayName={user.display_name}
              hasPhoto={user.avatar_source === "upload" && user.avatar_url !== null}
            />
          </div>

          <div className="pixel-panel flex flex-col gap-2.5 p-5">
            <div className="flex items-center justify-between">
              <span className="font-pixel text-sm">{t("profile.streak")}</span>
              <span className="text-2xl text-[#3a3a3a]">
                {t("profile.streak_days", { count: user.current_streak_days })}
              </span>
            </div>
            <div className="mt-1.5 flex gap-2">
              <PixelSlot className="flex h-16 flex-1 flex-col items-center justify-center gap-1 leading-none">
                <span className="font-pixel text-xs text-[#fff6d6]">
                  {Math.round(user.best_wpm)}
                </span>
                <span className="text-lg text-white">{t("race.wpm")}</span>
              </PixelSlot>
              <PixelSlot className="flex h-16 flex-1 flex-col items-center justify-center gap-1 leading-none">
                <span className="font-pixel text-xs text-[#fff6d6]">{user.total_races}</span>
                <span className="text-lg text-white">{t("profile.races")}</span>
              </PixelSlot>
              <PixelSlot className="flex h-16 flex-1 flex-col items-center justify-center gap-1 leading-none">
                <span className="font-pixel text-xs text-[#fff6d6]">
                  {user.current_streak_days}j
                </span>
                <span className="text-lg text-white">{t("profile.streak")}</span>
              </PixelSlot>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-grow flex-col gap-6">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {[
              [t("profile.best"), `${formatNumber(lang, stats.bestWpm)} ${t("race.wpm")}`],
              [
                t("profile.average"),
                `${stats.avgWpm != null ? formatNumber(lang, stats.avgWpm) : "—"} ${t("race.wpm")}`,
              ],
              [
                t("profile.accuracy"),
                stats.avgAccuracy != null ? formatPercent(lang, stats.avgAccuracy, 1) : "—",
              ],
              [t("profile.races"), formatNumber(lang, stats.races)],
              [t("profile.wins"), formatNumber(lang, stats.wins)],
              [t("profile.streak"), t("profile.streak_days", { count: user.current_streak_days })],
            ].map(([label, value]) => (
              <PixelSlot key={label} className="p-2.5 leading-none">
                <b className="font-pixel mb-1 block text-[9px] text-[#ffefb3]">{label}</b>
                <span className="text-3xl text-white">{value}</span>
              </PixelSlot>
            ))}
          </div>

          <div className="pixel-panel p-5">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="font-pixel text-sm">
                {t("profile.progress", { count: points.length })}
              </span>
            </div>
            <div className="border-4 border-black bg-[#1b1b1b] p-2">
              {points.length > 0 ? (
                <ProgressChart
                  data={points}
                  lang={lang}
                  label={t("profile.progress_aria")}
                  averageLabel={t("profile.progress_average")}
                  wpmLabel={t("race.wpm")}
                />
              ) : (
                <p className="p-6 text-center text-2xl text-[#8b8b8b]">
                  {t("profile.progress_empty")}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-6 sm:flex-row">
            <div className="pixel-panel flex-1 p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-pixel text-sm">{t("profile.worst_keys")}</span>
                <span className="text-xl text-[#3a3a3a]">{t("res.heatmap_legend")}</span>
              </div>
              <PixelKeyboard rows={heatmapRows} label={t("res.heatmap")} />
            </div>
          </div>

          <div className="pixel-panel p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-pixel text-sm">{t("profile.history")}</h2>
              <PixelButton href="/historique" variant="gold" className="h-11 px-5 text-[10px]">
                {t("hist.see_all")}
              </PixelButton>
            </div>
            {history.length === 0 ? (
              <p className="text-xl text-[#3a3a3a]">{t("profile.history_empty")}</p>
            ) : (
              <ul aria-label={t("profile.history")} className="flex flex-col gap-3">
                {history.map((h) => (
                  <HistoryCard key={h.raceId} row={h} lang={lang} />
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end">
            <LogoutButton />
          </div>
        </div>
      </div>
    </PixelShell>
  );
}
