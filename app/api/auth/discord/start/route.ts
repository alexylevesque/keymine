import { NextResponse } from "next/server";
import { createOAuthState, siteUrl } from "@/lib/auth/oauth";

// AUTH-5 (souhaitable): démarre le login Discord. Scope "identify" seulement
// — pas "email": on ne demande jamais le courriel du fournisseur (C3).
export async function GET() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      `${siteUrl()}/connexion?error=oauth_not_configured&provider=discord`,
    );
  }

  const state = await createOAuthState();
  const redirectUri = `${siteUrl()}/api/auth/discord/callback`;
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
