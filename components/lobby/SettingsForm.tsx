"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { PixelLabel, PixelPanel, PixelSlot } from "@/components/ui";
import { formatDuration } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import { BUNDLED_CORPUS } from "@/lib/text/corpus";
import { generateRaceText } from "@/lib/text/generate";
import type { Difficulty, Language, TextType } from "@/db/types";
import type { AccentType } from "@/lib/text/accents";
import { BONUS_KINDS } from "@/lib/race/bonus";
import { DURATION_CHOICES } from "@/lib/race/duration";
import { checkRoomName, normalizeRoomName, ROOM_NAME_MAX } from "@/lib/room-name";
import { DIGIT_ROWS, LETTER_ROWS, SYMBOL_ROWS } from "./key-maps";
import {
  setBonusEnabled,
  settingsToPayload,
  toggleBonusKind,
  toggled,
  type Access,
  type ErrorMode,
  type SettingsState,
  type TextOption,
} from "./settings";
import { AccentKeyMap, CharKeyMap, Legend } from "./TriStateKeys";

// CONF-01 : aucun temps maximal, ou de 30 secondes à 10 minutes.
export const DURATIONS = DURATION_CHOICES;

const COMPLEXITY_KEYS = {
  easy: ["set.easy", "set.easy_sub"],
  medium: ["set.medium", "set.medium_sub"],
  hard: ["set.hard", "set.hard_sub"],
} as const;

// Ponctuation et Accents ouvrent chacun une carte de touches ; Nombres et Majuscules sont dans « Lettres ».
const TEXT_OPTIONS: TextOption[] = ["Ponctuation", "Accents"];

// Délai avant de tirer un nouvel aperçu : le texte ne change pas à chaque cran d'un curseur.
const PREVIEW_DELAY_MS = 450;

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
}: {
  value: SettingsState;
  onChange: (patch: Partial<SettingsState>) => void;
  layout?: "split" | "stacked";
  /** Éléments propres à la création (rôle de l'hôte, bots) insérés dans le panneau de gauche. */
  leftExtra?: ReactNode;
  /** Création : le nom de la salle est obligatoire (la modification garde l'ancien s'il est vide). */
  requireName?: boolean;
}) {
  const { t, lang } = useLanguage();
  const v = value;
  const random = v.textType === "aleatoire";
  const accents = random && v.options.includes("Accents") && v.language === "fr"; // CONF-06 : accents « pour le français »
  const punctuation = random && v.options.includes("Ponctuation");

  // L'aperçu est tiré au hasard : on ne le calcule qu'après l'hydratation, sinon le texte
  // du serveur et celui du navigateur diffèrent (erreur d'hydratation React).
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Ce que le serveur recevra vraiment : l'aperçu montre donc le même texte que la course.
  const payload = settingsToPayload(v);

  // Seuls les réglages qui changent le texte comptent : bouger la taille du lobby, la durée ou la
  // longueur ne tire pas un nouvel aperçu. Le tirage attend ensuite un court instant (anti-rebond).
  const textKey = JSON.stringify([
    v.textType,
    v.language,
    v.complexity,
    payload.uppercase,
    payload.punctuation,
    payload.digits,
    payload.accents,
    payload.includeChars,
    payload.excludeChars,
    payload.accentWanted,
    payload.accentForbidden,
  ]);
  const [settledKey, setSettledKey] = useState(textKey);
  useEffect(() => {
    const timer = setTimeout(() => setSettledKey(textKey), PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [textKey]);

  const preview = useMemo(() => {
    if (!hydrated) return "";
    const [
      type,
      language,
      complexity,
      uppercase,
      punctuationOn,
      digits,
      accentsOn,
      include,
      exclude,
      wanted,
      forbidden,
    ] = JSON.parse(settledKey) as [
      TextType,
      Language,
      Difficulty,
      boolean,
      boolean,
      boolean,
      boolean,
      string[],
      string[],
      AccentType[],
      AccentType[],
    ];
    try {
      return generateRaceText(
        {
          type,
          language,
          length: 12,
          complexity,
          uppercase,
          punctuation: punctuationOn,
          digits,
          accents: accentsOn,
          includeChars: include,
          excludeChars: exclude,
          accentWanted: wanted,
          accentForbidden: forbidden,
        },
        BUNDLED_CORPUS,
      );
    } catch {
      return "";
    }
  }, [hydrated, settledKey]);

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

      <div className="flex gap-6">
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
        <label className="mt-2 flex items-center gap-2.5 text-xl">
          <input
            type="checkbox"
            checked={v.penalty}
            onChange={(e) => onChange({ penalty: e.target.checked })}
            className="h-5 w-5 accent-[#3f7d24]"
          />
          {t("set.penalty")}
        </label>
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
        <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3">
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

      <fieldset className="min-w-0 border-2 border-[#6b6b6b] p-3">
        <legend className="font-pixel px-1 text-[11px] text-[#3a3a3a]">{t("set.options")}</legend>
        <div className="flex flex-wrap gap-2">
          {TEXT_OPTIONS.map((o) => {
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
          })}
        </div>
        <p className="mt-1.5 text-lg text-[#3a3a3a]">
          {!random
            ? t("set.options_coherent")
            : v.language === "en"
              ? `${t("set.options_note")} ${t("set.accents_fr_only")}`
              : t("set.options_note")}
        </p>
        <div className="mt-3">
          <Legend />
        </div>

        {accents && (
          <div className="mt-4">
            <PixelLabel>{t("set.accent_types")}</PixelLabel>
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
        )}

        {punctuation && (
          <div className="mt-4" aria-disabled={!random} data-testid="symbol-map">
            <PixelLabel>{t("set.symbols")}</PixelLabel>
            <CharKeyMap
              rows={SYMBOL_ROWS}
              label={t("set.symbols")}
              wanted={v.includeChars}
              forbidden={v.excludeChars}
              disabled={!random}
              onChange={(next) =>
                onChange({ includeChars: next.wanted, excludeChars: next.forbidden })
              }
            />
            {!random && <p className="mt-1.5 text-lg text-[#3a3a3a]">{t("set.chars_disabled")}</p>}
          </div>
        )}
      </fieldset>

      <div data-testid="letter-map">
        <PixelLabel>{t("set.letters")}</PixelLabel>
        <div className="mb-3 flex flex-wrap gap-2">
          {(["Nombres", "Majuscules"] as const).map((o) => (
            <Chip
              key={o}
              on={v.options.includes(o)}
              disabled={!random}
              onClick={() => onChange({ options: toggled(v.options, o) })}
            >
              {t(`set.opt_${o}` as const)}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <CharKeyMap
            rows={LETTER_ROWS}
            label={t("set.letters")}
            wanted={v.includeChars}
            forbidden={v.excludeChars}
            disabled={!random}
            onChange={(next) =>
              onChange({ includeChars: next.wanted, excludeChars: next.forbidden })
            }
          />
          {random && v.options.includes("Nombres") && (
            <div data-testid="digit-map" className="pixel-reveal">
              <div className="mb-2 flex h-7 items-center text-lg text-[#3a3a3a]">
                {t("set.digits")}
              </div>
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
    </div>
  );

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
