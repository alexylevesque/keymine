import { NextResponse } from "next/server";
import { consumeOAuthState, loginOrCreateOAuthUser, siteUrl } from "@/lib/auth/oauth";
import { discordUserResponse, oauthCallbackQuery, oauthTokenResponse, parseSearchParams } from "@/lib/api-input";

export async function GET(request: Request) {
  const query = parseSearchParams(request.url, oauthCallbackQuery);
  const loginError = () =>
    NextResponse.redirect(
      `${siteUrl()}/connexion?error=${encodeURIComponent("Échec de la connexion Discord")}`,
    );

  const stateOk = await consumeOAuthState(query?.state ?? null);
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!stateOk || !query || !clientId || !clientSecret) return loginError();
  const { code } = query;

  try {
    const redirectUri = `${siteUrl()}/api/auth/discord/callback`;
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) return loginError();
    const token = oauthTokenResponse.safeParse(await tokenRes.json());
    if (!token.success) return loginError();
    const { access_token } = token.data;

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!userRes.ok) return loginError();
    const parsedUser = discordUserResponse.safeParse(await userRes.json());
    if (!parsedUser.success) return loginError();
    const discordUser = parsedUser.data;

    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;

    await loginOrCreateOAuthUser("discord", {
      providerId: discordUser.id,
      username: discordUser.username,
      avatarUrl,
    });

    return NextResponse.redirect(siteUrl());
  } catch {
    return loginError();
  }
}
