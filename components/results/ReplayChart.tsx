import type { CSSProperties } from "react";

// Replay de la course (maquette « 4 · Résultats ») : la place de chaque joueur à chaque 10 % du
// texte. On retrouve quand chacun a passé chaque palier grâce à son MPM moyen relevé chaque
// seconde (caractères tapés ≈ MPM × 5 × secondes / 60).

export type ReplaySeries = {
  id: string;
  name: string;
  isMe: boolean;
  /** Place finale (sert à départager). */
  rank: number;
  /** Caractères tapés à la fin et longueur du texte. */
  progress: number;
  textLength: number;
  points: { t: number; wpm: number }[];
};

export type ReplayPoint = { rank: number; wpm: number | null };

const STEPS = 10;
const COLORS = ["#f0b429", "#45cfc8", "#f39a8c", "#c77dff", "#5aa9f0", "#c97a2a", "#e8f4f8"];

/** Place de chaque joueur à chaque palier de 10 % (calcul pur, testé). */
export function replayRanks(series: ReplaySeries[]): Map<string, ReplayPoint[]> {
  const out = new Map<string, ReplayPoint[]>(series.map((s) => [s.id, []]));
  for (let k = 1; k <= STEPS; k++) {
    const timing = series.map((s) => {
      const target = (s.textLength * k) / STEPS;
      let reached: { t: number; wpm: number } | null = null;
      for (const p of s.points) {
        if ((p.wpm * 5 * p.t) / 60 >= target - 0.5) {
          reached = p;
          break;
        }
      }
      // Fin de texte : seuls ceux qui l'ont fini l'ont atteinte.
      if (k === STEPS && s.progress < s.textLength) reached = null;
      if (k < STEPS && !reached && s.progress >= target) reached = s.points.at(-1) ?? null;
      return { s, reached };
    });
    timing.sort((a, b) => {
      if (a.reached && b.reached) return a.reached.t - b.reached.t || a.s.rank - b.s.rank;
      if (a.reached) return -1;
      if (b.reached) return 1;
      return a.s.rank - b.s.rank;
    });
    timing.forEach(({ s, reached }, i) =>
      out.get(s.id)!.push({ rank: i + 1, wpm: reached?.wpm ?? null }),
    );
  }
  return out;
}

export function ReplayChart({
  series,
  label,
  placeLabel,
  tipLabel,
}: {
  series: ReplaySeries[];
  label: string;
  /** « 1ER », « 2E »… */
  placeLabel: (rank: number) => string;
  /** Infobulle d'un point : nom, palier, place, MPM. */
  tipLabel: (name: string, pct: number, rank: number, wpm: number | null) => string;
}) {
  const ranks = replayRanks(series);
  const n = Math.max(1, series.length);
  const y = (rank: number) => ((rank - 0.5) / n) * 240;
  const ordered = [...series].sort((a, b) => Number(a.isMe) - Number(b.isMe));
  let colorIndex = 0;
  const colorOf = new Map(
    series.map((s) => [s.id, s.isMe ? "#7fc45a" : COLORS[colorIndex++ % COLORS.length]!]),
  );
  return (
    <div className="replay-chart">
      <div className="relative" aria-hidden="true">
        {series.map((_, i) => (
          <span
            key={i}
            className="font-pixel absolute right-0 text-[9px]"
            style={{
              top: `calc(${((i + 0.5) / n) * 100}% - 6px)`,
              color: i === 0 ? "var(--km-gold-text)" : "var(--km-ink-3)",
            }}
          >
            {placeLabel(i + 1)}
          </span>
        ))}
      </div>
      <div role="img" aria-label={label} className="relative">
        <svg
          viewBox="0 0 1000 240"
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {series.map((_, i) => (
            <line
              key={`h${i}`}
              x1="0"
              y1={y(i + 1)}
              x2="1000"
              y2={y(i + 1)}
              stroke="#2b1e13"
              strokeWidth="2"
            />
          ))}
          {Array.from({ length: STEPS }, (_, i) => (
            <line
              key={`v${i}`}
              x1={50 + i * 100}
              y1="10"
              x2={50 + i * 100}
              y2="230"
              stroke="#2b1e13"
              strokeWidth="2"
              strokeDasharray="4 6"
            />
          ))}
          {ordered.map((s) => {
            const pts = ranks
              .get(s.id)!
              .map((p, i) => `${50 + i * 100},${y(p.rank)}`)
              .join(" ");
            return (
              <g key={s.id}>
                <polyline
                  className={`replay-bump ${s.isMe ? "replay-me" : ""}`}
                  points={pts}
                  fill="none"
                  stroke="#000"
                  strokeWidth={s.isMe ? 16 : 12}
                  opacity={s.isMe ? 1 : 0.55}
                />
                <polyline
                  className={`replay-bump ${s.isMe ? "replay-me" : ""}`}
                  points={pts}
                  fill="none"
                  stroke={colorOf.get(s.id)}
                  strokeWidth={s.isMe ? 10 : 6}
                  opacity={s.isMe ? 1 : 0.55}
                />
              </g>
            );
          })}
        </svg>
        {ordered.map((s) =>
          ranks.get(s.id)!.map((p, i) => (
            <span
              key={`${s.id}-${i}`}
              className={`replay-pt ${s.isMe ? "replay-ptme" : ""}`}
              style={{
                left: `${5 + i * 10}%`,
                top: `${(y(p.rank) / 240) * 100}%`,
                background: colorOf.get(s.id),
              }}
              data-tip={tipLabel(s.name, (i + 1) * 10, p.rank, p.wpm)}
            />
          )),
        )}
      </div>
      <div className="relative" aria-hidden="true">
        {series.map((s) => {
          const last = ranks.get(s.id)!.at(-1)!;
          return (
            <span
              key={s.id}
              className="replay-name absolute left-0 truncate text-lg"
              style={
                {
                  top: `calc(${(y(last.rank) / 240) * 100}% - 12px)`,
                  "--c": colorOf.get(s.id),
                  maxWidth: 96,
                } as CSSProperties
              }
            >
              {s.name}
            </span>
          );
        })}
      </div>
      <div className="replay-xax" aria-hidden="true">
        {Array.from({ length: STEPS }, (_, i) => (
          <span key={i}>{(i + 1) * 10} %</span>
        ))}
      </div>
    </div>
  );
}
