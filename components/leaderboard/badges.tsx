"use client";

import { useLanguage, type DictKey } from "@/lib/i18n";

// Petits dessins pixel originaux du classement : couronne du champion et badge de classe.

export const LEAGUE_COLORS = ["#b8763e", "#c9ced6", "#f2c230", "#45cfc8", "#8a5cc7"] as const;

const CROWN = ["O..O..O..O", "OBOOBOOBOO", "OBBBBBBBBO", "OBLBBBBLBO", "OBBBBBBBBO", "OOOOOOOOOO"];

/** Couronne du champion de la semaine passée, aux couleurs de sa classe. */
export function Crown({ league, className = "" }: { league: number; className?: string }) {
  const { t } = useLanguage();
  const color = LEAGUE_COLORS[league] ?? LEAGUE_COLORS[0];
  const fill: Record<string, string> = { O: "#1a1a1a", B: color, L: "#ffffff" };
  const label = t("lb.crown", { league: t(`league.${league}` as DictKey) });
  return (
    <svg
      viewBox="0 0 10 6"
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className={`inline-block h-3 w-5 shrink-0 align-middle ${className}`}
    >
      <title>{label}</title>
      {CROWN.flatMap((row, y) =>
        [...row].map((ch, x) =>
          fill[ch] ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill[ch]} />
          ) : null,
        ),
      )}
    </svg>
  );
}

/** Badge de classe : un petit bloc à la couleur de la classe, avec son nom pour les lecteurs d'écran. */
export function LeagueBadge({ league, withName = false }: { league: number; withName?: boolean }) {
  const { t } = useLanguage();
  const name = t(`league.${league}` as DictKey);
  return (
    <span className="inline-flex shrink-0 items-center gap-1 align-middle" title={name}>
      <span
        aria-hidden="true"
        className="inline-block h-3 w-3 border-2 border-black"
        style={{ background: LEAGUE_COLORS[league] ?? LEAGUE_COLORS[0] }}
      />
      {withName ? <span>{name}</span> : <span className="sr-only">{name}</span>}
    </span>
  );
}
