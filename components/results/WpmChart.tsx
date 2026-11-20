"use client";

import { useState } from "react";
import { HIDDEN_FIRST_SECONDS } from "./chart-config";

// RES-03 : évolution du MPM dans le temps, tous les participants sur un même graphique.
// SVG pur (aucune dépendance). Pour rester lisible quand plusieurs courbes se superposent :
// une couleur ET un symbole par participant, le nom écrit au bout de la courbe, une légende
// cliquable (masquer / afficher une courbe) et la mise en avant de la courbe survolée.
// La couleur n'est jamais la seule information : symbole, tiret (bots) et épaisseur (« moi »).

export type ChartSeries = {
  id: string;
  /** Nom complet (légende), avec le MPM final. */
  name: string;
  /** Nom court, écrit au bout de la courbe. */
  shortName: string;
  isBot: boolean;
  isMe: boolean;
  points: { t: number; wpm: number }[];
};

const COLORS = [
  "#7fd36a",
  "#f0b429",
  "#6fb1ff",
  "#ff7b6b",
  "#c58bff",
  "#4fd1c5",
  "#ffa94d",
  "#f783ac",
  "#e6e6e6",
  "#a3a3ff",
];
const SHAPES = ["circle", "square", "triangle", "diamond"] as const;

const W = 760;
const H = 300;
const PAD = { left: 44, right: 118, top: 16, bottom: 34 };
const LABEL_GAP = 14;

function Marker({
  shape,
  x,
  y,
  color,
}: {
  shape: (typeof SHAPES)[number];
  x: number;
  y: number;
  color: string;
}) {
  const common = { fill: color, stroke: "#1b1b1b", strokeWidth: 1.5 } as const;
  if (shape === "circle") return <circle cx={x} cy={y} r={4.5} {...common} />;
  if (shape === "square") return <rect x={x - 4} y={y - 4} width={8} height={8} {...common} />;
  if (shape === "triangle")
    return <polygon points={`${x},${y - 5.5} ${x + 5},${y + 4} ${x - 5},${y + 4}`} {...common} />;
  return (
    <polygon points={`${x},${y - 6} ${x + 5.5},${y} ${x},${y + 6} ${x - 5.5},${y}`} {...common} />
  );
}

/** Écarte les étiquettes qui se chevauchent (de haut en bas), en restant dans la zone du graphique. */
function spreadLabels(
  wanted: { id: string; y: number }[],
  top: number,
  bottom: number,
): Map<string, number> {
  const sorted = [...wanted].sort((a, b) => a.y - b.y);
  const placed: { id: string; y: number }[] = [];
  for (const item of sorted) {
    const previous = placed[placed.length - 1];
    placed.push({ id: item.id, y: Math.max(item.y, previous ? previous.y + LABEL_GAP : top) });
  }
  // Si le bas déborde, on remonte l'ensemble.
  for (let i = placed.length - 1; i >= 0; i--) {
    const limit = i === placed.length - 1 ? bottom : placed[i + 1]!.y - LABEL_GAP;
    if (placed[i]!.y > limit) placed[i]!.y = limit;
  }
  return new Map(placed.map((p) => [p.id, p.y]));
}

export function WpmChart({
  series,
  title,
  description,
  note,
  xLabel,
  yLabel,
  showAllLabel,
}: {
  series: ChartSeries[];
  title: string;
  description: string;
  /** Explication sous le graphique : ce que mesure la courbe et comment la lire. */
  note: string;
  xLabel: string;
  yLabel: string;
  showAllLabel: string;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);

  const allT = series.flatMap((s) => s.points.map((p) => p.t));
  const maxT = Math.max(1, ...allT);
  // Course très courte : on garde tous les points plutôt que de n'avoir plus rien à tracer.
  const fromT = maxT > HIDDEN_FIRST_SECONDS + 3 ? HIDDEN_FIRST_SECONDS : 0;
  const prepared = series
    .map((s, index) => ({ ...s, index, points: s.points.filter((p) => p.t > fromT) }))
    .filter((s) => s.points.length > 0);
  const shown = prepared.filter((s) => !hidden.has(s.id));

  const maxWpm = Math.max(20, ...shown.flatMap((s) => s.points.map((p) => p.wpm)));
  const niceMax = Math.ceil(maxWpm / 20) * 20;
  const span = Math.max(1, maxT - fromT);
  const x = (t: number) => PAD.left + ((t - fromT) / span) * (W - PAD.left - PAD.right);
  const y = (wpm: number) => H - PAD.bottom - (wpm / niceMax) * (H - PAD.top - PAD.bottom);

  const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMax * f));
  const ticksX = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(fromT + span * f));

  const labelY = spreadLabels(
    shown.map((s) => ({ id: s.id, y: y(s.points[s.points.length - 1]!.wpm) })),
    PAD.top + 4,
    H - PAD.bottom,
  );

  // Les bots d'abord, puis les autres, « moi » en dernier : ma courbe reste visible par-dessus.
  const drawOrder = [...shown].sort(
    (a, b) => Number(a.isMe) - Number(b.isMe) || Number(b.isBot) - Number(a.isBot),
  );
  const opacityOf = (id: string) => (focus && focus !== id ? 0.2 : 1);

  function toggle(id: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-labelledby="wpm-chart-title wpm-chart-desc"
      >
        <title id="wpm-chart-title">{title}</title>
        <desc id="wpm-chart-desc">{description}</desc>
        <rect x="0" y="0" width={W} height={H} fill="#1b1b1b" />
        {ticksY.map((v) => (
          <g key={`y${v}`}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#3a3a3a" />
            <text
              x={PAD.left - 6}
              y={y(v) + 4}
              textAnchor="end"
              fill="#cfcfcf"
              fontSize="12"
              fontFamily="monospace"
            >
              {v}
            </text>
          </g>
        ))}
        {ticksX.map((v) => (
          <text
            key={`x${v}`}
            x={x(v)}
            y={H - 14}
            textAnchor="middle"
            fill="#cfcfcf"
            fontSize="12"
            fontFamily="monospace"
          >
            {v}
          </text>
        ))}
        <text
          x={W - PAD.right}
          y={H - 1}
          textAnchor="end"
          fill="#a8a8a8"
          fontSize="11"
          fontFamily="monospace"
        >
          {xLabel}
        </text>
        <text x={PAD.left + 4} y={12} fill="#a8a8a8" fontSize="11" fontFamily="monospace">
          {yLabel}
        </text>

        {drawOrder.map((s) => {
          const color = COLORS[s.index % COLORS.length]!;
          const shape = SHAPES[s.index % SHAPES.length]!;
          const step = Math.max(1, Math.ceil(s.points.length / 5));
          const last = s.points[s.points.length - 1]!;
          return (
            <g
              key={s.id}
              opacity={opacityOf(s.id)}
              onMouseEnter={() => setFocus(s.id)}
              onMouseLeave={() => setFocus(null)}
            >
              <polyline
                fill="none"
                stroke={color}
                strokeWidth={s.isMe ? 4 : 2.5}
                strokeDasharray={s.isBot ? "7 4" : undefined}
                strokeLinejoin="round"
                points={s.points
                  .map((p) => `${x(p.t).toFixed(1)},${y(p.wpm).toFixed(1)}`)
                  .join(" ")}
              />
              {s.points.map((p, i) =>
                i % step === 0 && i !== s.points.length - 1 ? (
                  <Marker key={p.t} shape={shape} x={x(p.t)} y={y(p.wpm)} color={color} />
                ) : null,
              )}
              <Marker shape={shape} x={x(last.t)} y={y(last.wpm)} color={color} />
              <text
                x={x(last.t) + 12}
                y={(labelY.get(s.id) ?? y(last.wpm)) + 4}
                fill={color}
                fontSize="13"
                fontFamily="monospace"
                fontWeight={s.isMe ? 700 : 400}
              >
                {s.shortName.length > 12 ? `${s.shortName.slice(0, 11)}…` : s.shortName}
              </text>
            </g>
          );
        })}
      </svg>

      <figcaption>
        <ul className="mt-3 flex flex-wrap gap-2 text-xl">
          {prepared.map((s) => {
            const color = COLORS[s.index % COLORS.length]!;
            const off = hidden.has(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-pressed={!off}
                  onClick={() => toggle(s.id)}
                  onMouseEnter={() => setFocus(s.id)}
                  onMouseLeave={() => setFocus(null)}
                  onFocus={() => setFocus(s.id)}
                  onBlur={() => setFocus(null)}
                  className={`flex min-h-9 items-center gap-2 border-2 border-black px-2 py-0.5 text-left ${
                    off ? "wpm-leg wpm-leg-off line-through" : "wpm-leg"
                  }`}
                >
                  <svg aria-hidden="true" width="34" height="14" viewBox="0 0 34 14">
                    <line
                      x1="1"
                      x2="33"
                      y1="7"
                      y2="7"
                      stroke={off ? "#8b8b8b" : color}
                      strokeWidth={s.isMe ? 4 : 2.5}
                      strokeDasharray={s.isBot ? "7 4" : undefined}
                    />
                    <Marker
                      shape={SHAPES[s.index % SHAPES.length]!}
                      x={17}
                      y={7}
                      color={off ? "#8b8b8b" : color}
                    />
                  </svg>
                  {s.name}
                </button>
              </li>
            );
          })}
          {hidden.size > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setHidden(new Set())}
                className="pixel-chip min-h-9 text-lg"
              >
                {showAllLabel}
              </button>
            </li>
          )}
        </ul>
        <p className="mt-3 text-xl text-[#3a3a3a]">{note}</p>
      </figcaption>
    </figure>
  );
}
