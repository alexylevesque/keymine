"use client";

import type { ReactNode } from "react";
import { useLanguage } from "@/lib/i18n";
import { ACCENT_LETTERS, ACCENT_TYPES, type AccentType } from "@/lib/text/accents";
import type { KeyRow } from "./key-maps";
import { choiceState, cycleChoice, type ChoiceState } from "./settings";

// Cartes de touches à trois états (CONF-06, CONF-07). Un clic passe de gris (neutre) à vert
// (« souvent ») puis rouge (« jamais »), un troisième clic revient au gris. Chaque touche est un
// vrai bouton : atteignable au clavier (Tab, Entrée ou Espace), avec un nom qui annonce son état.

const MARKS: Record<ChoiceState, string> = { neutral: "", wanted: "+", forbidden: "×" };

function TriStateKey({
  state,
  name,
  onCycle,
  disabled,
  wide,
  children,
}: {
  state: ChoiceState;
  /** Ce que la touche représente, pour le lecteur d'écran (« Q », « tréma »…). */
  name: string;
  onCycle: () => void;
  disabled?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      className="pixel-tri-key"
      data-state={state}
      data-mark={MARKS[state]}
      data-wide={wide ? "true" : undefined}
      disabled={disabled}
      aria-label={t("set.key_aria", { key: name, state: t(`set.state_${state}`) })}
      onClick={onCycle}
    >
      {children}
    </button>
  );
}

/** Rappel des trois états, avec les mêmes touches que la carte (couleur, marque et trait). */
export function Legend() {
  const { t } = useLanguage();
  return (
    <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-lg text-[#3a3a3a]">
      {(["neutral", "wanted", "forbidden"] as const).map((state) => (
        <li key={state} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="pixel-tri-swatch" data-state={state}>
            {MARKS[state]}
          </span>
          {t(`set.legend_${state}`)}
        </li>
      ))}
    </ul>
  );
}

/** Carte de lettres ou de symboles : les listes `wanted` / `forbidden` contiennent aussi les autres touches. */
export function CharKeyMap({
  rows,
  label,
  wanted,
  forbidden,
  onChange,
  disabled,
}: {
  rows: KeyRow[];
  label: string;
  wanted: string[];
  forbidden: string[];
  onChange: (next: { wanted: string[]; forbidden: string[] }) => void;
  disabled?: boolean;
}) {
  return (
    <div className="max-w-full min-w-0">
      <div role="group" aria-label={label} className="overflow-x-auto overflow-y-hidden p-1 pb-2">
        <div className="flex w-max flex-col gap-1.5">
          {rows.map((row, i) => (
            <div
              key={i}
              className="flex gap-1.5"
              style={{ marginLeft: `calc((2.5rem + 0.375rem) * ${row.indent})` }}
            >
              {row.keys.map((key) => (
                <TriStateKey
                  key={key}
                  name={key.length === 1 && /\p{L}/u.test(key) ? key.toUpperCase() : key}
                  state={choiceState(key, wanted, forbidden)}
                  disabled={disabled}
                  onCycle={() => onChange(cycleChoice(key, wanted, forbidden))}
                >
                  {/\p{L}/u.test(key) ? key.toUpperCase() : key}
                </TriStateKey>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Types d'accents : grave, aigu, circonflexe, tréma, cédille. */
export function AccentKeyMap({
  label,
  wanted,
  forbidden,
  onChange,
  compact = false,
}: {
  /** Création : petites touches côte à côte (maquette) au lieu des grandes cartes. */
  compact?: boolean;
  label: string;
  wanted: AccentType[];
  forbidden: AccentType[];
  onChange: (next: { wanted: AccentType[]; forbidden: AccentType[] }) => void;
}) {
  const { t } = useLanguage();
  return (
    <div>
      <div
        role="group"
        aria-label={label}
        className={
          compact
            ? "create-accents flex flex-wrap gap-1.5 p-1"
            : "grid grid-cols-2 gap-2 sm:grid-cols-3"
        }
      >
        {ACCENT_TYPES.map((type) => (
          <TriStateKey
            key={type}
            wide
            name={t(`set.acc_${type}`)}
            state={choiceState(type, wanted, forbidden)}
            onCycle={() => onChange(cycleChoice(type, wanted, forbidden))}
          >
            <span className="pixel-accent-name">{t(`set.acc_${type}`)}</span>
            <span className="pixel-accent-letters">{ACCENT_LETTERS[type]}</span>
          </TriStateKey>
        ))}
      </div>
    </div>
  );
}
