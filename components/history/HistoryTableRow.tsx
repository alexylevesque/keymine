import Link from "next/link";
import { formatNumber, formatPercent, localeOf } from "@/lib/format";
import type { HistoryRow } from "@/lib/history";
import { translate, type DictKey } from "@/lib/i18n-dictionary";
import type { Language } from "@/db/types";
import { DeleteHistoryButton } from "./DeleteHistoryButton";
import { ReplayButton } from "./ReplayButton";

// Une ligne du tableau de la page Historique (maquette « 5b · Historique »).

const MEDAL = ["#f0b429", "#c6c6c6", "#c97a2a"];

export function HistoryTableRow({
  row: r,
  lang,
  index,
}: {
  row: HistoryRow;
  lang: Language;
  index: number;
}) {
  const t = (key: DictKey, p?: Record<string, string | number>) => translate(lang, key, p);
  const spectated = r.role === "spectator";
  const status: { key: DictKey; bg: string; fg: string } = spectated
    ? { key: "hist.st_spectated", bg: "#2b5c7a", fg: "#fff" }
    : r.status === "abandoned"
      ? { key: "hist.st_abandoned", bg: "#b0281c", fg: "#fff" }
      : r.status === "timeout"
        ? { key: "hist.st_timeout", bg: "#c97a2a", fg: "#fff" }
        : { key: "hist.st_finished", bg: "#3f7d24", fg: "#fff" };
  const date = new Intl.DateTimeFormat(localeOf(lang), { dateStyle: "medium" }).format(r.playedAt);
  const time = new Intl.DateTimeFormat(localeOf(lang), { timeStyle: "short" }).format(r.playedAt);
  const played = !spectated && r.status !== "abandoned";
  return (
    <div role="row" className="hist-cols hist-row" style={{ animationDelay: `${index * 0.05}s` }}>
      <span role="cell" className="min-w-0">
        <span className="block text-[22px] text-white">{date}</span>
        <span className="block text-[17px] text-[#a8966e]">{time}</span>
      </span>
      <span role="cell" className="flex items-center gap-2">
        {played && r.rank ? (
          <>
            <span
              className="hist-medal font-pixel"
              style={{
                background: MEDAL[r.rank - 1] ?? "#3b2a1a",
                color: r.rank <= 3 ? "#1b1209" : "var(--km-ink)",
              }}
            >
              {r.rank}
            </span>
            <span className="text-lg text-[#a8966e]">
              {t("hist.of_short", { count: r.participantCount })}
            </span>
          </>
        ) : (
          <span className="text-[#a8966e]">—</span>
        )}
      </span>
      <span role="cell" className="text-[26px] text-white">
        {spectated ? "—" : formatNumber(lang, r.wpm)}
      </span>
      <span role="cell" className="text-[22px]">
        {spectated ? "—" : formatPercent(lang, r.accuracy)}
      </span>
      <span role="cell" className="truncate text-[22px]">
        {r.winnerName ?? "—"}
      </span>
      <span role="cell">
        <span className="hist-st font-pixel" style={{ background: status.bg, color: status.fg }}>
          {t(status.key)}
        </span>
      </span>
      <span role="cell" className="flex flex-wrap justify-end gap-1.5">
        <Link
          href={`/resultats/${r.lobbyCode}?course=${r.raceId}`}
          className="hist-rb hist-det font-pixel"
        >
          <i className="hist-eye" aria-hidden="true" />
          {t("hist.details_short")}
        </Link>
        {!spectated && <ReplayButton raceId={r.raceId} compact />}
        <DeleteHistoryButton raceId={r.raceId} compactLabel={t("hist.delete_aria", { date })} />
      </span>
    </div>
  );
}
