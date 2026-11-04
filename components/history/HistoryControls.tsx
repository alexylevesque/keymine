"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n";
import {
  HISTORY_SORTS,
  type HistoryDirection,
  type HistorySection,
  type HistorySort,
} from "@/lib/history-config";

// Tri de l'historique : une liste (date, MPM, classement) et UNE flèche qui inverse le sens.
// L'état est dans l'adresse (?sort=…&dir=…) : un tri se partage et survit au rechargement.

export function HistoryControls({
  section,
  sort,
  dir,
}: {
  section: HistorySection;
  sort: HistorySort;
  dir: HistoryDirection;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLanguage();
  // Pas de MPM ni de rang personnels pour une course regardée en spectateur.
  const sorts = section === "spectated" ? (["date"] as const) : HISTORY_SORTS;

  function go(next: { sort?: HistorySort; dir?: HistoryDirection }) {
    const params = new URLSearchParams({ section, sort: next.sort ?? sort, dir: next.dir ?? dir });
    router.replace(`${pathname}?${params.toString()}`);
  }

  const ascending = dir === "asc";
  const directionLabel = t(ascending ? "hist.dir_asc" : "hist.dir_desc");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="history-sort" className="text-xl text-[#a8966e]">
        {t("hist.sort_by")}
      </label>
      <select
        id="history-sort"
        value={sort}
        onChange={(e) => go({ sort: e.target.value as HistorySort })}
        className="hist-sel"
      >
        {sorts.map((s) => (
          <option key={s} value={s}>
            {t(`hist.sort_${s}` as const)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => go({ dir: ascending ? "desc" : "asc" })}
        aria-label={directionLabel}
        title={directionLabel}
        className="hist-dirb"
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 18 18" fill="currentColor">
          {/* flèche vers le haut = croissant, vers le bas = décroissant */}
          {ascending ? <path d="M9 3l6 8H3z" /> : <path d="M9 15l6-8H3z" />}
        </svg>
      </button>
    </div>
  );
}
