// Tuile « À travailler » de l'accueil.

/** Touches à travailler : au moins 5 frappes, taux d'erreur le plus haut d'abord. */
export function weakestKeys(
  rows: { char: string; correct_count: number; error_count: number }[],
  max = 3,
): { key: string; rate: number }[] {
  return rows
    .filter(
      (r) => r.char.trim() !== "" && r.error_count > 0 && r.correct_count + r.error_count >= 5,
    )
    .map((r) => ({ key: r.char, rate: r.error_count / (r.correct_count + r.error_count) }))
    .sort((a, b) => b.rate - a.rate || a.key.localeCompare(b.key))
    .slice(0, max);
}
