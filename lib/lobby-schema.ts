import { z } from "zod";
import { roomNameSchema } from "@/lib/room-name";
import { ACCENT_TYPES } from "@/lib/text/accents";
import { BONUS_KINDS } from "@/lib/race/bonus";
import { isValidDuration } from "@/lib/race/duration";

// CONF-01 à CONF-12 : réglages d'une salle, validés côté serveur (TECH-07).
const char = z.string().min(1).max(2);
const accentType = z.enum(ACCENT_TYPES);
const MAX_CHARS = 80;

const lobbyFields = z.object({
    // Nom de la salle : contrôlé (longueur, caractères, liens, mots interdits). Sans nom, l'API en propose un.
    name: roomNameSchema.optional(),
    access: z.enum(["public", "unlisted", "private"]).default("public"),
    hostRole: z.enum(["participant", "spectator"]).default("participant"),
    maxPlayers: z.number().int().min(2).max(30).default(30), // SALLE-05
    // CONF-01 : temps maximal « aucun » (0) ou de 30 secondes à 10 minutes.
    durationSeconds: z
      .number()
      .int()
      .refine(isValidDuration, { message: "Temps maximal : aucun, ou de 30 secondes à 10 minutes." })
      .default(300),
    language: z.enum(["fr", "en"]).default("fr"), // CONF-02
    textType: z.enum(["coherent", "aleatoire"]).default("coherent"), // CONF-03
    textLength: z.number().int().min(10).max(400).default(40), // CONF-04 (mots)
    complexity: z.enum(["easy", "medium", "hard"]).default("easy"), // CONF-05
    uppercase: z.boolean().default(false), // CONF-06
    punctuation: z.boolean().default(false),
    digits: z.boolean().default(false),
    accents: z.boolean().default(true),
    // CONF-07 : lettres et symboles « à privilégier » (vert) et « interdits » (rouge) ; gris = ni l'un ni l'autre.
    includeChars: z.array(char).max(MAX_CHARS).default([]),
    excludeChars: z.array(char).max(MAX_CHARS).default([]),
    // CONF-06 : même logique par type d'accent (grave, aigu, circonflexe, tréma, cédille).
    accentWanted: z.array(accentType).max(ACCENT_TYPES.length).default([]),
    accentForbidden: z.array(accentType).max(ACCENT_TYPES.length).default([]),
    errorMode: z.enum(["accumuler", "bloquer"]).default("accumuler"), // CONF-08
    penaltySeconds: z.number().min(0).max(10).default(1),
    comebackBonus: z.boolean().default(true), // CONF-09 : interrupteur général
    bonusKinds: z.array(z.enum(BONUS_KINDS)).max(BONUS_KINDS.length).default([...BONUS_KINDS]), // CONF-09 : lesquels
});

type ChoiceLists = {
  includeChars?: string[];
  excludeChars?: string[];
  accentWanted?: string[];
  accentForbidden?: string[];
};

/** Un caractère (ou un type d'accent) ne peut pas être à la fois à privilégier et interdit. */
const notBoth = {
  check: (s: ChoiceLists) =>
    !(s.includeChars ?? []).some((c) => (s.excludeChars ?? []).includes(c)) &&
    !(s.accentWanted ?? []).some((a) => (s.accentForbidden ?? []).includes(a)),
  params: { message: "Un choix ne peut pas être à la fois souhaité et interdit", path: ["includeChars"] },
};

/** Création d'une salle : tous les réglages, avec leurs valeurs par défaut. */
export const lobbySettingsSchema = lobbyFields.refine(notBoth.check, notBoth.params);

/** CONF-12 : modification partielle des réglages en salle d'attente (le rôle de l'hôte ne change pas). */
export const lobbyUpdateSchema = lobbyFields
  .omit({ hostRole: true })
  .partial()
  .refine(notBoth.check, notBoth.params);

export type LobbySettings = z.infer<typeof lobbySettingsSchema>;
export type LobbyUpdate = z.infer<typeof lobbyUpdateSchema>;
