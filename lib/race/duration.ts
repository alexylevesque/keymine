// Temps maximal d'une course (CONF-01) : aucun, ou entre 30 secondes et 10 minutes.
// « Aucun » est enregistré comme 0 seconde (colonne entière non nulle en base).
export const NO_TIME_LIMIT = 0;
export const MIN_DURATION_SECONDS = 30;
export const MAX_DURATION_SECONDS = 600;

/** Choix proposés dans le formulaire : sans limite, puis de 30 s à 10 min. */
export const DURATION_CHOICES = [NO_TIME_LIMIT, 30, 60, 120, 180, 300, 600] as const;

export function isValidDuration(seconds: number): boolean {
  return (
    seconds === NO_TIME_LIMIT ||
    (Number.isInteger(seconds) && seconds >= MIN_DURATION_SECONDS && seconds <= MAX_DURATION_SECONDS)
  );
}

export function hasTimeLimit(seconds: number): boolean {
  return seconds !== NO_TIME_LIMIT;
}
