"use client";

import { useState, type ReactNode } from "react";
import { PixelLabel, PixelPanel, PixelSlot } from "@/components/ui";
import { formatDuration } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import type { Difficulty } from "@/db/types";
import { BONUS_KINDS } from "@/lib/race/bonus";
import { DURATION_CHOICES } from "@/lib/race/duration";
import { checkRoomName, normalizeRoomName, ROOM_NAME_MAX } from "@/lib/room-name";
import { DIGIT_ROWS, LETTER_ROWS, SYMBOL_ROWS } from "./key-maps";
import {
  setBonusEnabled,
  toggleBonusKind,
  toggled,
  type Access,
  type ErrorMode,
  type SettingsState,
  type TextOption,
} from "./settings";
import { AccentKeyMap, CharKeyMap, Legend } from "./TriStateKeys";
import { useTextPreview } from "./useTextPreview";

// CONF-01 : aucun temps maximal, ou de 30 secondes à 10 minutes.
export const DURATIONS = DURATION_CHOICES;

const COMPLEXITY_KEYS = {
  easy: ["set.easy", "set.easy_sub"],
  medium: ["set.medium", "set.medium_sub"],
  hard: ["set.hard", "set.hard_sub"],
} as const;

// Ponctuation et Accents ouvrent chacun une carte de touches ; Nombres et Majuscules sont dans « Lettres ».
const TEXT_OPTIONS: TextOption[] = ["Ponctuation", "Accents"];

export function Chip({
  on,
  onClick,
  children,
  label,
  disabled = false,
  title,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  label?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-on={on && !disabled}
      aria-pressed={on}
      aria-label={label}
      className="pixel-chip text-xl"
    >
      {children}
    </button>
  );
}

function Choice({
  on,
  onClick,
  title,
  sub,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  sub: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-on={on}
      aria-pressed={on}
      className="pixel-chip flex flex-col items-start gap-1 leading-tight"
    >
      <b className="font-pixel text-[11px] font-normal">{title}</b>
      <span className="text-lg">{sub}</span>
    </button>
  );
}

/**
 * Formulaire de réglages partagé entre « Créer une course » et la salle
 * d'attente (CONF-12). `layout="split"` : deux panneaux côte à côte ;
 * `layout="stacked"` : une seule colonne (barre latérale de la salle).
 */
export function SettingsForm({
  value,
  onChange,
  layout = "split",
  leftExtra,
  requireName = false,
  compact = false,
  roleSlot,
  botsSlot,
}: {
  value: SettingsState;
  onChange: (patch: Partial<SettingsState>) => void;
  layout?: "split" | "stacked" | "numbered";
  /** Éléments propres à la création (rôle de l'hôte, bots) insérés dans le panneau de gauche. */
  leftExtra?: ReactNode;
  /** Création : le nom de la salle est obligatoire (la modification garde l'ancien s'il est vide). */
  requireName?: boolean;
  /**
   * Création (refonte du 4 nov.) : durée en boutons, réglages avancés du texte repliés et rangés
   * en onglets, pas d'aperçu dans le formulaire (il vient à l'étape « continuer »).
   */
  compact?: boolean;
  /** Mise en page « numbered » (création) : rôle de l'hôte et bots, rangés dans la section 1. */
  roleSlot?: ReactNode;
  botsSlot?: ReactNode;
}) {
  const { t, lang } = useLanguage();
  const v = value;
  const random = v.textType === "aleatoire";
  const accents = random && v.options.includes("Accents") && v.language === "fr"; // CONF-06 : accents « pour le français »
  const punctuation = random && v.options.includes("Ponctuation");

  const preview = useTextPreview(v);
  const [advTab, setAdvTab] = useState<"letters" | "accents" | "symbols">("letters");

  const nameProblem = checkRoomName(normalizeRoomName(v.name));

  const general = (
    <div className="flex flex-col gap-4">
      <div>
        <PixelLabel>{t("set.name")}</PixelLabel>
        <input
          type="text"
          value={v.name}
          onChange={(e) => onChange({ name: e.target.value })}
          maxLength={ROOM_NAME_MAX + 10}
          required={requireName}
          aria-label={t("set.name_aria")}
          aria-invalid={v.name !== "" && nameProblem !== null}
          aria-describedby="room-name-hint"
          autoComplete="off"
          className="pixel-slot h-11 w-full px-2.5 text-2xl text-white"
        />
        <p
          id="room-name-hint"
          role={v.name !== "" && nameProblem ? "alert" : undefined}
          className={`mt-1 text-lg ${v.name !== "" && nameProblem ? "text-[#9b2d20]" : "text-[#3a3a3a]"}`}
        >
          {v.name !== "" && nameProblem ? t(`err.${nameProblem}` as const) : t("set.name_hint")}
        </p>
      </div>

      <div>
        <PixelLabel>{t("set.access")}</PixelLabel>
        <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3">
          {(
            [
              ["public", t("set.access_public"), t("set.access_public_sub")],
              ["unlisted", t("set.access_unlisted"), t("set.access_unlisted_sub")],
              ["private", t("set.access_private"), t("set.access_private_sub")],
            ] as [Access, string, string][]
          ).map(([key, title, sub]) => (
            <Choice
              key={key}
              on={v.access === key}
              onClick={() => onChange({ access: key })}
              title={title}
              sub={sub}
            />
          ))}
        </div>
      </div>

      <div className={compact ? "flex flex-col gap-4" : "flex gap-6"}>
        <div>
          <PixelLabel>{t("set.language")}</PixelLabel>
          <div className="flex gap-2">
            {(["fr", "en"] as const).map((lang) => (
              <Chip
                key={lang}
                on={v.language === lang}
                onClick={() => onChange({ language: lang })}
              >
                {lang.toUpperCase()}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex-grow">
          <PixelLabel>{t("set.duration")}</PixelLabel>
          {compact ? (
            <div role="group" aria-label={t("set.duration_aria")} className="flex flex-wrap gap-2">
              {DURATIONS.map((seconds) => (
                <Chip
                  key={seconds}
                  on={v.duration === seconds}
                  onClick={() => onChange({ duration: seconds })}
                >
                  {formatDuration(lang, seconds)}
                </Chip>
              ))}
            </div>
          ) : (
            <select
              aria-label={t("set.duration_aria")}
              className="pixel-slot h-10 w-full px-2.5 text-2xl text-white"
              value={v.duration}
              onChange={(e) => onChange({ duration: Number(e.target.value) })}
            >
              {DURATIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {formatDuration(lang, seconds)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div>
        <PixelLabel>{t("set.size", { count: v.lobbySize })}</PixelLabel>
        <input
          type="range"
          min={2}
          max={30}
          value={v.lobbySize}
          onChange={(e) => onChange({ lobbySize: Number(e.target.value) })}
          aria-label={t("set.size_aria")}
          className="w-full accent-[#3f7d24]"
        />
      </div>

      {leftExtra}

      <div>
        <PixelLabel>{t("set.errors")}</PixelLabel>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          {(
            [
              ["accumuler", t("set.errors_accumulate"), t("set.errors_accumulate_sub")],
              ["bloquer", t("set.errors_block"), t("set.errors_block_sub")],
            ] as [ErrorMode, string, string][]
          ).map(([key, title, sub]) => (
            <Choice
              key={key}
              on={v.errorMode === key}
              onClick={() => onChange({ errorMode: key })}
              title={title}
              sub={sub}
            />
          ))}
        </div>
      </div>

      <fieldset className="min-w-0">
        <legend className="font-pixel mb-2 text-[11px] text-[#3a3a3a]">
          {t("set.bonus_title")}
        </legend>
        <label className="flex items-center gap-2.5 text-xl">
          <input
            type="checkbox"
            checked={v.comebackBonus}
            onChange={(e) => onChange(setBonusEnabled(v, e.target.checked))}
            className="h-5 w-5 accent-[#3f7d24]"
          />
          {t("set.bonus")}
        </label>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {BONUS_KINDS.map((kind) => (
            <Choice
              key={kind}
              on={v.comebackBonus && v.bonusKinds.includes(kind)}
              disabled={!v.comebackBonus}
              onClick={() => onChange(toggleBonusKind(v, kind))}
              title={t(`set.bonus_${kind}`)}
              sub={t(`set.bonus_${kind}_sub`)}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );

  const letterMap = (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
      <CharKeyMap
        rows={LETTER_ROWS}
        label={t("set.letters")}
        wanted={v.includeChars}
        forbidden={v.excludeChars}
        disabled={!random}
        onChange={(next) => onChange({ includeChars: next.wanted, excludeChars: next.forbidden })}
      />
      {random && v.options.includes("Nombres") && (
        <div data-testid="digit-map" className="pixel-reveal">
          <div className="mb-2 flex h-7 items-center text-lg text-[#3a3a3a]">{t("set.digits")}</div>
          <CharKeyMap
            rows={DIGIT_ROWS}
            label={t("set.digits")}
            wanted={v.includeChars}
            forbidden={v.excludeChars}
            disabled={!random}
            onChange={(next) =>
              onChange({ includeChars: next.wanted, excludeChars: next.forbidden })
            }
          />
        </div>
      )}
    </div>
  );

  const accentMap = accents ? (
    <div>
      <AccentKeyMap
        label={t("set.accent_types")}
        wanted={v.accentWanted}
        forbidden={v.accentForbidden}
        onChange={(next) =>
          onChange({ accentWanted: next.wanted, accentForbidden: next.forbidden })
        }
      />
      <p className="mt-1.5 text-lg text-[#3a3a3a]">{t("set.accent_note")}</p>
    </div>
  ) : null;

  const symbolMap = punctuation ? (
    <div aria-disabled={!random} data-testid="symbol-map">
      <CharKeyMap
        rows={SYMBOL_ROWS}
        label={t("set.symbols")}
        wanted={v.includeChars}
        forbidden={v.excludeChars}
        disabled={!random}
        onChange={(next) => onChange({ includeChars: next.wanted, excludeChars: next.forbidden })}
      />
    </div>
  ) : null;

  const optionChip = (o: TextOption) => {
    // Vrais passages : tapés tels qu'écrits. Anglais : pas d'accents (CONF-06).
    const englishAccents = o === "Accents" && v.language === "en";
    return (
      <Chip
        key={o}
        on={v.options.includes(o)}
        disabled={!random || englishAccents}
        title={englishAccents ? t("set.accents_fr_only") : undefined}
        onClick={() => onChange({ options: toggled(v.options, o) })}
      >
        {t(`set.opt_${o}` as const)}
      </Chip>
    );
  };

  const optionsNote = !random
    ? t("set.options_coherent")
    : v.language === "en"
      ? `${t("set.options_note")} ${t("set.accents_fr_only")}`
      : t("set.options_note");

  // Création : tout le détail du texte tient dans une section repliée, rangée en trois onglets.
  const advanced = (
    <details className="settings-adv" data-testid="advanced-text">
      <summary className="settings-adv-sum">
        <span className="settings-adv-chev font-pixel" aria-hidden="true">
          &gt;
        </span>
        <span className="font-pixel flex-grow text-[11px]">{t("set.advanced")}</span>
        <span className="settings-adv-btn font-pixel">
          <span className="settings-adv-open">{t("set.advanced_open")}</span>
          <span className="settings-adv-close">{t("set.advanced_close")}</span>
        </span>
      </summary>
      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {[...TEXT_OPTIONS, "Nombres" as const, "Majuscules" as const].map(optionChip)}
        </div>
        <p className="text-lg text-[#3a3a3a]">{optionsNote}</p>
        <Legend />
        <div role="tablist" aria-label={t("set.advanced")} className="settings-tabs">
          {(
            [
              ["letters", t("set.letters")],
              ["accents", t("set.accent_types")],
              ["symbols", t("set.symbols")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={advTab === key}
              data-on={advTab === key}
              onClick={() => setAdvTab(key)}
              className="settings-tab font-pixel"
            >
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" data-testid="letter-map">
          {advTab === "letters" && (
            <>
              {letterMap}
              <p className="mt-1.5 text-lg text-[#3a3a3a]">
                {random ? t("set.letters_note") : t("set.chars_disabled")}
              </p>
            </>
          )}
          {advTab === "accents" &&
            (accentMap ?? <p className="text-lg text-[#3a3a3a]">{t("set.tab_accents_off")}</p>)}
          {advTab === "symbols" &&
            (symbolMap ?? <p className="text-lg text-[#3a3a3a]">{t("set.tab_symbols_off")}</p>)}
        </div>
      </div>
    </details>
  );

  const text = (
    <div className="flex flex-col gap-4">
      <div>
        <PixelLabel>{t("set.text_type")}</PixelLabel>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          <Choice
            on={v.textType === "coherent"}
            onClick={() => onChange({ textType: "coherent" })}
            title={t("set.text_coherent")}
            sub={t("set.text_coherent_sub")}
          />
          <Choice
            on={v.textType === "aleatoire"}
            onClick={() => onChange({ textType: "aleatoire" })}
            title={t("set.text_random")}
            sub={t("set.text_random_sub")}
          />
        </div>
      </div>

      <div>
        <PixelLabel>{t("set.complexity")}</PixelLabel>
        {/* Colonnes d'au moins 9,5 rem : « DIFFICILE » en police pixel ne déborde jamais du bouton. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2">
          {(Object.keys(COMPLEXITY_KEYS) as Difficulty[]).map((level) => (
            <Choice
              key={level}
              on={v.complexity === level}
              onClick={() => onChange({ complexity: level })}
              title={t(COMPLEXITY_KEYS[level][0])}
              sub={t(COMPLEXITY_KEYS[level][1])}
            />
          ))}
        </div>
      </div>

      <div>
        <PixelLabel>{t("set.length", { count: v.length })}</PixelLabel>
        <input
          type="range"
          min={10}
          max={400}
          value={v.length}
          onChange={(e) => onChange({ length: Number(e.target.value) })}
          aria-label={t("set.length_aria")}
          className="w-full accent-[#3f7d24]"
        />
      </div>

      {compact ? (
        advanced
      ) : (
        <>
          <fieldset className="min-w-0 border-2 border-[#6b6b6b] p-3">
            <legend className="font-pixel px-1 text-[11px] text-[#3a3a3a]">
              {t("set.options")}
            </legend>
            <div className="flex flex-wrap gap-2">{TEXT_OPTIONS.map(optionChip)}</div>
            <p className="mt-1.5 text-lg text-[#3a3a3a]">{optionsNote}</p>
            <div className="mt-3">
              <Legend />
            </div>
            {accentMap && (
              <div className="mt-4">
                <PixelLabel>{t("set.accent_types")}</PixelLabel>
                {accentMap}
              </div>
            )}
            {symbolMap && (
              <div className="mt-4">
                <PixelLabel>{t("set.symbols")}</PixelLabel>
                {symbolMap}
                {!random && (
                  <p className="mt-1.5 text-lg text-[#3a3a3a]">{t("set.chars_disabled")}</p>
                )}
              </div>
            )}
          </fieldset>

          <div data-testid="letter-map">
            <PixelLabel>{t("set.letters")}</PixelLabel>
            <div className="mb-3 flex flex-wrap gap-2">
              {(["Nombres", "Majuscules"] as const).map(optionChip)}
            </div>
            {letterMap}
            <p className="mt-1.5 text-lg text-[#3a3a3a]">
              {random ? t("set.letters_note") : t("set.chars_disabled")}
            </p>
          </div>

          <div>
            <PixelLabel>{t("set.preview")}</PixelLabel>
            <div data-testid="text-preview">
              <PixelSlot className="px-3.5 py-3 text-3xl leading-snug text-white">
                {preview || "…"}
              </PixelSlot>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // Création (maquette « 2b · Créer une salle ») : trois sections numérotées, choix en segments.
  if (layout === "numbered") {
    const seg = <K extends string>(
      label: string,
      options: readonly (readonly [K, string])[],
      current: K,
      pick: (k: K) => void,
    ) => (
      <fieldset className="min-w-0">
        <legend className="create-lbl font-pixel">{label}</legend>
        <div className="flex flex-wrap gap-1.5">
          {options.map(([key, text]) => (
            <button
              key={key}
              type="button"
              data-on={current === key}
              aria-pressed={current === key}
              onClick={() => pick(key)}
              className="create-opt font-pixel"
            >
              {text}
            </button>
          ))}
        </div>
      </fieldset>
    );
    const accessSub = {
      public: t("set.access_public_sub"),
      unlisted: t("set.access_unlisted_sub"),
      private: t("set.access_private_sub"),
    }[v.access];
    const durLabel = (sec: number) =>
      sec === 0
        ? t("create.dur_none")
        : sec < 60
          ? t("create.dur_s", { n: sec })
          : t("create.dur_min", { n: sec / 60 });
    const BONUS_LOOK = {
      minus_words: { c: "#45cfc8", who: t("create.who_last"), d: ["M1 3h6v2h-6z"] },
      plus_words: { c: "#f0b429", who: t("create.who_first"), d: ["M1 3h6v2h-6z", "M3 1h2v6h-2z"] },
      fog: {
        c: "#c77dff",
        who: t("create.who_first"),
        d: ["M0 2h5v1h-5z", "M2 4h6v1h-6z", "M1 6h4v1h-4z"],
      },
    } as const;

    return (
      <div className="flex flex-col gap-6">
        <section aria-labelledby="sec-room" className="create-panel">
          <h2 id="sec-room" className="font-pixel text-[13px] text-white">
            <span className="text-[#7fc45a]">1</span> {t("create.sec_room")}
          </h2>
          <div>
            <label htmlFor="room-name" className="create-lbl font-pixel">
              {t("set.name")}
            </label>
            <input
              id="room-name"
              type="text"
              value={v.name}
              onChange={(e) => onChange({ name: e.target.value })}
              maxLength={ROOM_NAME_MAX + 10}
              required={requireName}
              aria-invalid={v.name !== "" && nameProblem !== null}
              aria-describedby="room-name-hint"
              autoComplete="off"
              className="home-code h-[52px] w-full px-3.5 text-[26px]"
            />
            <p
              id="room-name-hint"
              role={v.name !== "" && nameProblem ? "alert" : undefined}
              className={`create-hint ${v.name !== "" && nameProblem ? "text-[#f39a8c]" : ""}`}
            >
              {v.name !== "" && nameProblem ? t(`err.${nameProblem}` as const) : t("set.name_hint")}
            </p>
          </div>
          <div className="flex flex-wrap gap-6">
            <div className="min-w-0">
              {seg(
                t("create.who"),
                [
                  ["public", t("set.access_public")],
                  ["unlisted", t("set.access_unlisted")],
                  ["private", t("set.access_private")],
                ] as const,
                v.access,
                (access) => onChange({ access }),
              )}
              <p className="create-hint">{accessSub}</p>
            </div>
            {roleSlot}
          </div>
          <div>
            <label htmlFor="room-size" className="create-lbl font-pixel">
              {t("create.max_players", { count: v.lobbySize })}
            </label>
            <input
              id="room-size"
              type="range"
              min={2}
              max={30}
              value={v.lobbySize}
              onChange={(e) => onChange({ lobbySize: Number(e.target.value) })}
              className="w-full accent-[#7fc45a]"
            />
          </div>
          {botsSlot}
        </section>

        <section aria-labelledby="sec-text" className="create-panel">
          <h2 id="sec-text" className="font-pixel text-[13px] text-white">
            <span className="text-[#7fc45a]">2</span> {t("create.sec_text")}
          </h2>
          <div className="flex flex-wrap gap-6">
            {seg(
              t("create.lang_short"),
              [
                ["fr", "FR"],
                ["en", "EN"],
              ] as const,
              v.language,
              (language) => onChange({ language }),
            )}
            {seg(
              t("create.type"),
              [
                ["coherent", t("create.type_passages")],
                ["aleatoire", t("create.type_random")],
              ] as const,
              v.textType,
              (textType) => onChange({ textType }),
            )}
            {seg(
              t("set.complexity"),
              (Object.keys(COMPLEXITY_KEYS) as Difficulty[]).map(
                (level) => [level, t(COMPLEXITY_KEYS[level][0])] as const,
              ),
              v.complexity,
              (complexity) => onChange({ complexity }),
            )}
          </div>
          <p className="create-hint -mt-2">{t(COMPLEXITY_KEYS[v.complexity][1])}</p>
          <div>
            <label htmlFor="room-length" className="create-lbl font-pixel">
              {t("set.length", { count: v.length })}
            </label>
            <input
              id="room-length"
              type="range"
              min={10}
              max={400}
              value={v.length}
              onChange={(e) => onChange({ length: Number(e.target.value) })}
              className="w-full accent-[#7fc45a]"
            />
          </div>
          {advanced}
        </section>

        <section aria-labelledby="sec-rules" className="create-panel">
          <h2 id="sec-rules" className="font-pixel text-[13px] text-white">
            <span className="text-[#7fc45a]">3</span> {t("create.sec_rules")}
          </h2>
          {seg(
            t("create.max_time"),
            DURATIONS.map((sec) => [String(sec), durLabel(sec)] as const),
            String(v.duration),
            (sec) => onChange({ duration: Number(sec) }),
          )}
          <fieldset className="min-w-0">
            <legend className="create-lbl font-pixel">{t("create.on_error")}</legend>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {(
                [
                  ["accumuler", t("create.err_go"), t("create.err_go_sub")],
                  ["bloquer", t("create.err_fix"), t("create.err_fix_sub")],
                ] as [ErrorMode, string, string][]
              ).map(([key, title, sub]) => (
                <button
                  key={key}
                  type="button"
                  data-on={v.errorMode === key}
                  aria-pressed={v.errorMode === key}
                  onClick={() => onChange({ errorMode: key })}
                  className="create-card"
                >
                  <b className="font-pixel text-[9px] font-normal text-white">{title}</b>
                  <span className="text-lg leading-[1.1] text-[#a8966e]">{sub}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="min-w-0">
            <legend className="create-lbl font-pixel">{t("create.bonus_title")}</legend>
            <div className="flex flex-col gap-2">
              {BONUS_KINDS.map((kind) => {
                const on = v.comebackBonus && v.bonusKinds.includes(kind);
                const look = BONUS_LOOK[kind];
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={on}
                    data-on={on}
                    onClick={() => onChange(toggleBonusKind(v, kind))}
                    className="create-bonus"
                  >
                    <span
                      className="create-bonus-ico"
                      style={{ boxShadow: `inset 0 0 0 2px ${look.c}` }}
                    >
                      <svg viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
                        {look.d.map((d) => (
                          <path key={d} d={d} fill={look.c} />
                        ))}
                      </svg>
                    </span>
                    <span className="flex min-w-0 flex-auto flex-col gap-1 text-left">
                      <span className="font-pixel text-[9px] text-white">
                        {t(`set.bonus_${kind}`)}
                      </span>
                      <span className="text-lg leading-[1.1] text-[#a8966e]">
                        {t(`create.bonus_${kind}_sub`)}
                      </span>
                    </span>
                    <span className="create-who font-pixel">{look.who}</span>
                    <span className="create-toggle" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </fieldset>
        </section>
      </div>
    );
  }

  if (layout === "stacked") {
    return (
      <div className="flex flex-col gap-6">
        {general}
        {text}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <PixelPanel className="w-full flex-none p-6 lg:w-[34rem]">{general}</PixelPanel>
      <PixelPanel className="w-full flex-grow p-6">{text}</PixelPanel>
    </div>
  );
}
