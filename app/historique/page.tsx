import Link from "next/link";
import { HistoryTableRow } from "@/components/history/HistoryTableRow";
import { HistoryControls } from "@/components/history/HistoryControls";
import { PixelShell } from "@/components/PixelShell";
import { PixelButton, PixelPanel } from "@/components/ui";
import { peekIdentity } from "@/lib/auth/identity";
import { formatNumber, formatPercent } from "@/lib/format";
import { loadProfileStats } from "@/lib/stats";
import {
  HISTORY_SECTIONS,
  loadHistory,
  parseHistoryQuery,
  type HistoryPage,
  type HistorySection,
} from "@/lib/history";
import { getRequestLang, pageMetadata } from "@/lib/i18n-server";
import { translate, type DictKey } from "@/lib/i18n-dictionary";

export const dynamic = "force-dynamic";
export const generateMetadata = pageMetadata("title.history");

const SECTION_KEY: Record<HistorySection, DictKey> = {
  all: "hist.section_all",
  played: "hist.section_played",
  abandoned: "hist.section_abandoned",
  spectated: "hist.section_spectated",
};

const EMPTY_KEY: Record<HistorySection, DictKey> = {
  all: "hist.empty",
  played: "hist.empty",
  abandoned: "hist.empty_abandoned",
  spectated: "hist.empty_spectated",
};

function href(
  history: Pick<HistoryPage, "section" | "sort" | "dir">,
  page = 1,
  section = history.section,
): string {
  const params = new URLSearchParams({ section, sort: history.sort, dir: history.dir });
  if (page > 1) params.set("page", String(page));
  return `/historique?${params.toString()}`;
}

export default async function HistoriquePage({ searchParams }: PageProps<"/historique">) {
  const lang = await getRequestLang();
  const t = (key: DictKey, p?: Record<string, string | number>) => translate(lang, key, p);
  const identity = await peekIdentity();

  if (!identity || identity.kind !== "user") {
    return (
      <PixelShell active="stats">
        <h1 className="font-pixel mb-6 text-xl text-white [text-shadow:4px_4px_0_#000]">
          {t("hist.title")}
        </h1>
        <PixelPanel className="p-6">
          <p className="mb-4 text-2xl">{t("hist.login")}</p>
          <PixelButton href="/connexion" variant="green" className="h-12 px-6 text-xs">
            {t("home.account")}
          </PixelButton>
        </PixelPanel>
      </PixelShell>
    );
  }

  const [history, stats] = await Promise.all([
    loadHistory(identity.userId, parseHistoryQuery(await searchParams)),
    loadProfileStats(identity.userId),
  ]);
  const winPct = stats.races > 0 ? Math.round((stats.wins / stats.races) * 100) : 0;

  return (
    <PixelShell active="stats">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Link
              href="/profil"
              className="font-pixel text-[8px] text-[#a8966e] no-underline hover:text-white"
            >
              {t("hist.back_profile")}
            </Link>
            <h1 className="font-pixel text-xl text-white [text-shadow:4px_4px_0_#000] sm:text-[26px]">
              {t("hist.title")}
            </h1>
          </div>
          <span className="text-xl text-[#cdbf9c]">{t("hist.subtitle")}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <a href="#liste" className="hist-tile">
            <span className="font-pixel text-[8px] text-[#ffe08a]">{t("hist.t_races")}</span>
            <span className="hist-num">{formatNumber(lang, history.counts.all)}</span>
            <span className="hist-more font-pixel">
              {t("hist.t_races_sub", {
                played: history.counts.played,
                abandoned: history.counts.abandoned,
              })}
            </span>
          </a>
          <a href="#liste" className="hist-tile">
            <span className="font-pixel text-[8px] text-[#ffe08a]">{t("hist.t_wins")}</span>
            <span className="hist-num text-[#f0b429]">{formatNumber(lang, stats.wins)}</span>
            <span className="hist-cups" aria-hidden="true">
              {Array.from({ length: 5 }, (_, i) => (
                <i key={i} data-on={i < Math.min(5, stats.wins)} />
              ))}
            </span>
            <span className="hist-more font-pixel">
              {t("hist.t_wins_sub", { pct: formatPercent(lang, winPct) })}
            </span>
          </a>
          <a href="#liste" className="hist-tile">
            <span className="font-pixel text-[8px] text-[#ffe08a]">{t("hist.t_best")}</span>
            <span className="hist-num text-[#f0b429]">
              {formatNumber(lang, Math.round(stats.bestWpm))} <small>{t("race.wpm")}</small>
            </span>
          </a>
          <a href="#liste" className="hist-tile">
            <span className="font-pixel text-[8px] text-[#ffe08a]">{t("hist.t_avg")}</span>
            <span className="hist-num">
              {stats.avgWpm != null ? formatNumber(lang, Math.round(stats.avgWpm)) : "—"}{" "}
              <small>{t("race.wpm")}</small>
            </span>
            {stats.avgAccuracy != null && (
              <span className="hist-more font-pixel">
                {t("hist.t_avg_sub", { acc: formatPercent(lang, Math.round(stats.avgAccuracy)) })}
              </span>
            )}
          </a>
        </div>

        <section className="lobby-panel" aria-labelledby="liste">
          <div className="lobby-head flex flex-wrap items-center justify-between gap-3 !py-3.5">
            <h2
              id="liste"
              className="font-pixel text-[11px] text-white [text-shadow:3px_3px_0_#000]"
            >
              {t("hist.list")}
            </h2>
            <span className="text-xl text-white">
              {t("hist.list_count", {
                count: history.counts[history.section],
                page: history.page,
                pages: Math.max(1, history.pages),
              })}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#3b2a1a] px-5 py-3.5">
            <nav aria-label={t("hist.sections")} className="flex flex-wrap gap-1.5">
              {HISTORY_SECTIONS.map((section) => (
                <Link
                  key={section}
                  href={href(history, 1, section)}
                  aria-current={section === history.section ? "page" : undefined}
                  data-on={section === history.section}
                  className="hist-chip font-pixel uppercase"
                >
                  {t(SECTION_KEY[section])} <b>{history.counts[section]}</b>
                </Link>
              ))}
            </nav>
            {history.total > 1 && (
              <HistoryControls section={history.section} sort={history.sort} dir={history.dir} />
            )}
          </div>

          {history.rows.length === 0 ? (
            <p className="px-5 py-4 text-2xl">{t(EMPTY_KEY[history.section])}</p>
          ) : (
            <div role="table" aria-label={t(SECTION_KEY[history.section])}>
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
              {history.rows.map((r, i) => (
                <HistoryTableRow key={r.raceId} row={r} lang={lang} index={i} />
              ))}
            </div>
          )}

          {history.pages > 1 && (
            <nav
              aria-label={t("hist.pages")}
              className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-[#3b2a1a] px-5 py-4"
            >
              {history.page > 1 ? (
                <Link href={href(history, history.page - 1)} className="hist-ghost font-pixel">
                  {t("hist.prev")}
                </Link>
              ) : (
                <span />
              )}
              <span className="flex gap-1.5">
                {Array.from({ length: history.pages }, (_, i) => i + 1).map((n) => (
                  <Link
                    key={n}
                    href={href(history, n)}
                    aria-current={n === history.page ? "page" : undefined}
                    data-on={n === history.page}
                    className="hist-pnum font-pixel"
                  >
                    {n}
                  </Link>
                ))}
              </span>
              {history.page < history.pages ? (
                <Link href={href(history, history.page + 1)} className="hist-ghost font-pixel">
                  {t("hist.next")}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </section>
      </div>
    </PixelShell>
  );
}
