// Personnage qui tape au clavier sur la page d'accueil (fonctionnalité ajoutée) : plus la souris est
// proche du bouton JOUER, plus il tape vite. Logique pure, testée.

export const TYPIST_MIN_RATE = 0.4;
export const TYPIST_MAX_RATE = 3;
/** Distance (px) au-delà de laquelle il tape à la vitesse minimale. */
export const TYPIST_FALLOFF_PX = 700;

/** Distance entre un point et un rectangle (0 si le point est dessus). */
export function distanceToRect(
  x: number,
  y: number,
  rect: { left: number; top: number; right: number; bottom: number },
): number {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);
  return Math.hypot(dx, dy);
}

/** Vitesse de lecture de la vidéo selon la distance de la souris au bouton (linéaire, bornée). */
export function typistRate(distance: number): number {
  const t = Math.min(1, Math.max(0, distance / TYPIST_FALLOFF_PX));
  return TYPIST_MAX_RATE - t * (TYPIST_MAX_RATE - TYPIST_MIN_RATE);
}

/** Sur écran tactile (pas de souris) : plus le bouton JOUER est visible, plus il tape vite (1 à 2,5). */
export function typistRateForVisibility(ratio: number): number {
  return 1 + Math.min(1, Math.max(0, ratio)) * 1.5;
}
