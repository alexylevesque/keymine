import { z } from "zod";

// Schémas Zod des entrées serveur qui ne sont pas des corps JSON (TECH-07) :
// segments d'URL, paramètres de requête, formulaires et réponses des
// fournisseurs OAuth. Les corps JSON ont leur schéma dans leur route.

/** Code de salle (SALLE-02) : lettres et chiffres, insensible à la casse. */
export const lobbyCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .regex(/^[A-Za-z0-9]+$/)
  .transform((s) => s.toUpperCase());

/** Jeton d'invitation (SALLE-04) : 32 octets aléatoires en base64url (43 caractères). */
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** Paramètres de retour d'un fournisseur OAuth (AUTH-01). */
export const oauthCallbackQuery = z.object({
  code: z.string().min(1).max(512),
  state: z.string().min(1).max(256),
});

export const oauthTokenResponse = z.object({ access_token: z.string().min(1) });

export const discordUserResponse = z.object({
  id: z.string().regex(/^\d+$/),
  username: z.string().min(1),
  avatar: z.string().nullable(),
});

export const githubUserResponse = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
  avatar_url: z.string().nullable(),
});

/** Formulaire de téléversement de la photo de profil (AUTH-04, SEC-02). */
export const avatarUploadForm = z.object({ file: z.instanceof(File) });

/** Lit les paramètres d'une URL et les valide ; `null` si invalides. */
export function parseSearchParams<T extends z.ZodType>(url: string, schema: T): z.infer<T> | null {
  const params = Object.fromEntries(new URL(url).searchParams);
  const parsed = schema.safeParse(params);
  return parsed.success ? parsed.data : null;
}
