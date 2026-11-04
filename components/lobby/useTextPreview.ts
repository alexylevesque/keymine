"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { BUNDLED_CORPUS } from "@/lib/text/corpus";
import { generateRaceText } from "@/lib/text/generate";
import type { Difficulty, Language, TextType } from "@/db/types";
import type { AccentType } from "@/lib/text/accents";
import { settingsToPayload, type SettingsState } from "./settings";

// Délai avant de tirer un nouvel aperçu : le texte ne change pas à chaque cran d'un curseur.
const PREVIEW_DELAY_MS = 450;

/**
 * Exemple de texte tiré avec les réglages de la salle (même générateur que la course).
 * `draw` : changer ce nombre tire un autre exemple avec les mêmes réglages (bouton « autre exemple »).
 */
export function useTextPreview(v: SettingsState, draw = 0): string {
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
    draw, // un nouveau tirage demandé change la clé : l'aperçu est recalculé
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

  return preview;
}
