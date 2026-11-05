"use client";

import type { CSSProperties } from "react";
import { useLanguage, type DictKey } from "@/lib/i18n";
import { formatNumber, formatPercent } from "@/lib/format";

// Clavier « KEYMINE » des maquettes (Résultats, onglet MON CLAVIER, et Profil, MON CLAVIER) :
// un vrai clavier complet, chaque touche tapée prend la couleur de son taux de réussite, les trois
// plus faibles clignotent, et le panneau de droite donne la précision et les touches à travailler.

type Cell = { key: string; w: number; mod?: DictKey | "blank" };

const L = (keys: string) => [...keys].map((key): Cell => ({ key, w: 46 }));
const MOD = (mod: DictKey | "blank", w: number): Cell => ({ key: "", w, mod });

/** Disposition QWERTY de la maquette (largeurs en pixels). */
export const BOARD: Cell[][] = [
  [...L("`1234567890-="), MOD("kb.backspace", 98)],
  [MOD("kb.tab", 72), ...L("qwertyuiop[]"), { key: "\\", w: 72 }],
  [MOD("kb.caps", 85), ...L("asdfghjkl;'"), MOD("kb.enter", 111)],
  [MOD("kb.shift", 111), ...L("zxcvbnm,./"), MOD("kb.shift", 137)],
  [MOD("blank", 72), MOD("blank", 59), { key: " ", w: 319 }, MOD("blank", 59), MOD("blank", 72)],
];

export type KeyTier = "off" | "top" | "ok" | "mid" | "bad";

/** Couleur d'une touche selon son taux de réussite (légende : 95 % +, 85, 75, moins de 75). */
export function keyTier(ok: number, bad: number): KeyTier {
  const total = ok + bad;
  if (total === 0) return "off";
  const pct = (100 * ok) / total;
  return pct >= 95 ? "top" : pct >= 85 ? "ok" : pct >= 75 ? "mid" : "bad";
}

/** Compteurs par touche, majuscules et minuscules ensemble (la touche est la même). */
export function keyCounts(correct: Record<string, number>, errors: Record<string, number>) {
  const out = new Map<string, { ok: number; bad: number }>();
  const add = (char: string, ok: number, bad: number) => {
    const k = char.toLowerCase();
    const cur = out.get(k) ?? { ok: 0, bad: 0 };
    out.set(k, { ok: cur.ok + ok, bad: cur.bad + bad });
  };
  for (const [c, n] of Object.entries(correct)) add(c, n, 0);
  for (const [c, n] of Object.entries(errors)) add(c, 0, n);
  return out;
}

/** Touches à travailler : au moins une erreur, la plus faible d'abord (au plus 3). */
export function weakKeys(counts: Map<string, { ok: number; bad: number }>, minTotal: number) {
  return [...counts.entries()]
    .filter(([k, c]) => k.trim() !== "" && c.bad > 0 && c.ok + c.bad >= minTotal)
    .map(([k, c]) => ({
      key: k,
      ok: c.ok,
      bad: c.bad,
      pct: Math.round((100 * c.ok) / (c.ok + c.bad)),
    }))
    .sort((a, b) => a.pct - b.pct || a.key.localeCompare(b.key))
    .slice(0, 3);
}

export function MineKeyboard({
  correct,
  errors,
  mode,
  races = 0,
}: {
  correct: Record<string, number>;
  errors: Record<string, number>;
  /** « race » : une course (résultats) ; « all » : toutes les courses (profil). */
  mode: "race" | "all";
  races?: number;
}) {
  const { t, lang } = useLanguage();
  const counts = keyCounts(correct, errors);
  const weak = weakKeys(counts, mode === "race" ? 1 : 5);
  const weakSet = new Set(weak.map((w) => w.key));
  let ok = 0;
  let total = 0;
  let typed = 0;
  let perfect = 0;
  for (const c of counts.values()) {
    ok += c.ok;
    total += c.ok + c.bad;
    if (c.ok + c.bad > 0) typed++;
    if (c.ok + c.bad > 0 && c.bad === 0) perfect++;
  }
  const label = (k: string) => (k === " " ? t("kb.space") : k.toUpperCase());
  const aria =
    weak.length > 0
      ? t("kb.aria", {
          list: weak.map((w) => `${label(w.key)} ${formatPercent(lang, w.pct)}`).join(", "),
        })
      : t("kb.aria_none");

  return (
    <div className="kb-wrap">
      <div className="kb-box" role="group" aria-label={aria} tabIndex={0}>
        <div className="kb-board" aria-hidden="true">
          <div className="kb-brand">
            <span className="font-pixel">{t("kb.brand")}</span>
            <span className="kb-leds">
              <i />
              <i />
              <i className="on" />
            </span>
          </div>
          {BOARD.map((row, r) => (
            <div key={r} className="kb-row">
              {row.map((cell, i) => {
                const style = { width: cell.w } as CSSProperties;
                if (cell.mod) {
                  return (
                    <span key={i} className="kb-k kb-mod" style={style}>
                      <b className="font-pixel">{cell.mod === "blank" ? "" : t(cell.mod)}</b>
                    </span>
                  );
                }
                const c = counts.get(cell.key);
                const tier = c ? keyTier(c.ok, c.bad) : "off";
                const pct =
                  c && c.ok + c.bad > 0 ? Math.round((100 * c.ok) / (c.ok + c.bad)) : null;
                return (
                  <span
                    key={i}
                    className={`kb-k kb-${tier} ${weakSet.has(cell.key) ? "kb-weak" : ""}`}
                    style={style}
                    data-tip={
                      pct === null
                        ? /[a-z ]/.test(cell.key)
                          ? t("kb.not_typed", { key: label(cell.key) })
                          : undefined
                        : t("kb.tip", { key: label(cell.key), pct: formatPercent(lang, pct) })
                    }
                  >
                    <b className="font-pixel">{label(cell.key)}</b>
                    {pct !== null && <small>{formatPercent(lang, pct)}</small>}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <aside className="kb-side">
        <div className="kb-acc">
          <div className="font-pixel text-[8px] text-[#ffe08a]">
            {mode === "race" ? t("kb.acc_race") : t("kb.acc_all")}
          </div>
          <div className="text-[40px] leading-none">
            {total > 0 ? formatPercent(lang, Math.round((100 * ok) / total)) : "—"}
          </div>
          <div className="text-[19px] text-[#a8966e]">
            {mode === "race"
              ? t("kb.sub_race", { n: formatNumber(lang, typed), p: formatNumber(lang, perfect) })
              : t("kb.sub_all", { races: formatNumber(lang, races), n: formatNumber(lang, typed) })}
          </div>
        </div>
        <div className="font-pixel mb-2.5 text-[8px] text-[#ffe08a]">{t("kb.work")}</div>
        {weak.length === 0 ? (
          <p className="mb-4 text-xl text-[#a8966e]">{t("kb.none")}</p>
        ) : (
          <ol className="mb-4 flex flex-col gap-2.5">
            {weak.map((w) => (
              <li key={w.key} className="kb-wk">
                <span className={`kb-k kb-${keyTier(w.ok, w.bad)} kb-mini`} aria-hidden="true">
                  <b className="font-pixel">{label(w.key)}</b>
                </span>
                <span className="min-w-0 flex-auto">
                  <span className="flex justify-between text-[21px]">
                    <span>
                      <span className="sr-only">{label(w.key)} : </span>
                      {formatPercent(lang, w.pct)}
                    </span>
                    <span className="text-[#a8966e]">
                      {w.bad === 1
                        ? t("kb.missed_one", { total: formatNumber(lang, w.ok + w.bad) })
                        : t("kb.missed", {
                            bad: formatNumber(lang, w.bad),
                            total: formatNumber(lang, w.ok + w.bad),
                          })}
                    </span>
                  </span>
                  <span className="kb-pbar">
                    <span className={`kb-${keyTier(w.ok, w.bad)}`} style={{ width: `${w.pct}%` }} />
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
        <div className="kb-scale" aria-hidden="true">
          <span className="kb-top" />
          <span className="kb-ok" />
          <span className="kb-mid" />
          <span className="kb-bad" />
        </div>
        <div className="flex justify-between text-[17px] text-[#a8966e]">
          <span>{t("kb.scale_top")}</span>
          <span>85</span>
          <span>75</span>
          <span>{t("kb.scale_bad")}</span>
        </div>
      </aside>
    </div>
  );
}
