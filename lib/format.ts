import type { SiteLang } from "./i18n-dictionary";

// I18N-03 : dates et nombres formatés selon la langue choisie.
const LOCALES: Record<SiteLang, string> = { fr: "fr-CA", en: "en-CA" };

export function localeOf(lang: SiteLang): string {
  return LOCALES[lang];
}

export function formatNumber(lang: SiteLang, value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat(localeOf(lang), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatPercent(lang: SiteLang, value: number, fractionDigits = 0): string {
  return `${formatNumber(lang, value, fractionDigits)}${lang === "fr" ? " %" : "%"}`;
}

export function formatDate(lang: SiteLang, date: Date | string, withTime = false): string {
  return new Intl.DateTimeFormat(localeOf(lang), {
    dateStyle: "long",
    ...(withTime ? { timeStyle: "short" } : {}),
  }).format(new Date(date));
}

/**
 * Durée d'une course, avec son unité pour ne pas la confondre (« 22,0 s » et non « 0:22 ») :
 * « 22,0 s » sous la minute, « 1 min 07,4 s » au-delà (point décimal en anglais).
 */
export function formatRaceTime(lang: SiteLang, ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  const format = (digits: number) =>
    new Intl.NumberFormat(localeOf(lang), {
      minimumIntegerDigits: digits,
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(seconds);
  return minutes === 0 ? `${format(1)} s` : `${minutes} min ${format(2)} s`;
}

const DURATION_UNITS: Record<SiteLang, Record<"second" | "minute" | "hour", [string, string]>> = {
  fr: { second: ["seconde", "secondes"], minute: ["minute", "minutes"], hour: ["heure", "heures"] },
  en: { second: ["second", "seconds"], minute: ["minute", "minutes"], hour: ["hour", "hours"] },
};

/**
 * Durée maximale d'une course : « 15 secondes », « 5 minutes », « 1 heure » (unité la plus grande
 * qui tombe juste). Écrit à la main plutôt qu'avec `Intl` (style « unit ») : Node et le navigateur
 * n'utilisent pas la même espace insécable, ce qui provoquait une erreur d'hydratation React.
 */
export function formatDuration(lang: SiteLang, seconds: number): string {
  if (seconds === 0) return lang === "fr" ? "Sans limite" : "No limit"; // CONF-01 : aucun temps maximal
  const [unit, value] =
    seconds % 3600 === 0
      ? (["hour", seconds / 3600] as const)
      : seconds % 60 === 0
        ? (["minute", seconds / 60] as const)
        : (["second", seconds] as const);
  const [one, many] = DURATION_UNITS[lang][unit];
  // Le français met le pluriel à partir de 2, l'anglais dès que la valeur n'est pas 1.
  const plural = lang === "fr" ? value >= 2 : value !== 1;
  return `${formatNumber(lang, value)} ${plural ? many : one}`;
}

/** Horloge « mm:ss » d'un compte à rebours (indépendante de la langue). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
