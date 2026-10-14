// Regroupement des envois d'avancement (PERF-02, TECH-06) : au plus un appel
// toutes les `intervalMs`, avec un dernier envoi garanti après une rafale et
// un envoi immédiat possible (fin du texte). Sans dépendance à React, pour
// être testé avec de fausses horloges.

export type Throttle = {
  /** Demande un envoi ; `immediate` force l'envoi tout de suite (fin du texte). */
  schedule: (immediate?: boolean) => void;
  /** Annule l'envoi en attente (démontage du composant). */
  cancel: () => void;
};

export function createThrottle(
  intervalMs: number,
  fn: () => void,
  now: () => number = Date.now,
): Throttle {
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = () => {
    timer = null;
    last = now();
    fn();
  };

  return {
    schedule(immediate = false) {
      const wait = intervalMs - (now() - last);
      if (immediate || wait <= 0) {
        if (timer) clearTimeout(timer);
        fire();
      } else if (!timer) {
        timer = setTimeout(fire, wait);
      }
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
