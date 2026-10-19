import "server-only";
import { randomUUID, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

/**
 * AUTH-5 (souhaitable): connexion via Discord/GitHub. On ne lit jamais le
 * courriel du fournisseur (décision C3 du cahier des charges) — seulement
 * un identifiant stable, un nom d'affichage, et une photo pour l'avatar.
 */

const STATE_COOKIE = "km_oauth_state";

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/** Dépose un jeton anti-CSRF (OAuth2 "state") avant de rediriger vers le fournisseur. */
export async function createOAuthState(): Promise<string> {
  const state = randomUUID();
  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return state;
}

/** Vérifie le "state" renvoyé par le fournisseur au retour (callback). */
export async function consumeOAuthState(returnedState: string | null): Promise<boolean> {
  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);
  return !!expected && !!returnedState && expected === returnedState;
}

/**
 * Les comptes créés par OAuth n'ont pas de mot de passe choisi par
 * l'utilisateur — la colonne `password_hash` reste `not null` (AUTH-1/2 exige
 * un mot de passe pour les comptes classiques), donc on y met un hash
 * aléatoire inutilisable: personne ne peut s'en servir pour se connecter
 * par mot de passe à un compte créé par OAuth.
 */
export function unusablePasswordHash(): string {
  return `oauth:${randomBytes(32).toString("hex")}`;
}

/** Dérive un nom d'utilisateur KeyMine valide (3-20 car., [a-zA-Z0-9_-]) depuis un pseudo du fournisseur. */
export function slugifyUsername(raw: string): string {
  const base = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 16);
  return base.length >= 3 ? base : `joueur${Math.floor(Math.random() * 10_000)}`;
}

export type OAuthIdentity = {
  providerId: string;
  username: string;
  avatarUrl: string | null;
};

export type OAuthProvider = "discord" | "github";

/**
 * Relie une identité OAuth à un compte KeyMine: si `discord_id`/`github_id`
 * existe déjà, on se contente de se connecter; sinon on crée un compte
 * (avatar_source = le fournisseur) puis on fusionne l'historique invité
 * (AUTH-8), comme pour l'inscription classique.
 */
export async function loginOrCreateOAuthUser(provider: OAuthProvider, identity: OAuthIdentity) {
  const { kysely: db } = await import("@/lib/db");
  const { createSession } = await import("@/lib/auth/session");
  const { mergeGuestHistory } = await import("@/lib/stats");
  const { readGuestId } = await import("@/lib/auth/guest");

  const idColumn = provider === "discord" ? "discord_id" : "github_id";

  let user = await db
    .selectFrom("users")
    .select(["id", "username", "display_name"])
    .where(idColumn, "=", identity.providerId)
    .executeTakeFirst();

  if (!user) {
    let username = slugifyUsername(identity.username);
    // Un pseudo de fournisseur peut déjà être pris côté KeyMine: on ajoute un
    // suffixe plutôt que d'échouer.
    for (let attempt = 0; attempt < 5; attempt++) {
      const taken = await db
        .selectFrom("users")
        .select("id")
        .where("username", "=", username)
        .executeTakeFirst();
      if (!taken) break;
      username = `${slugifyUsername(identity.username).slice(0, 12)}${Math.floor(Math.random() * 10_000)}`;
    }

    user = await db
      .insertInto("users")
      .values({
        username,
        password_hash: unusablePasswordHash(),
        display_name: username,
        avatar_url: identity.avatarUrl,
        avatar_source: provider,
        [idColumn]: identity.providerId,
      })
      .returning(["id", "username", "display_name"])
      .executeTakeFirstOrThrow();
  } else if (identity.avatarUrl) {
    // Avatar à jour à chaque connexion (il peut changer côté fournisseur).
    await db
      .updateTable("users")
      .set({ avatar_url: identity.avatarUrl })
      .where("id", "=", user.id)
      .execute();
  }

  await createSession({ userId: user.id, username: user.username }, true);

  const guestId = await readGuestId();
  if (guestId) {
    await mergeGuestHistory(guestId, user.id);
  }

  return user;
}
