import { NextResponse } from "next/server";
import { createOAuthState, siteUrl } from "@/lib/auth/oauth";

// AUTH-5 (souhaitable): démarre le login GitHub. Scope "read:user" seulement
// — pas "user:email": on ne demande jamais le courriel du fournisseur (C3).
export async function GET() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      `${siteUrl()}/connexion?error=oauth_not_configured&provider=github`,
    );
  }

  const state = await createOAuthState();
  const redirectUri = `${siteUrl()}/api/auth/github/callback`;
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
