import { NextResponse } from "next/server";
import { consumeOAuthState, loginOrCreateOAuthUser, siteUrl } from "@/lib/auth/oauth";
import { githubUserResponse, oauthCallbackQuery, oauthTokenResponse, parseSearchParams } from "@/lib/api-input";

export async function GET(request: Request) {
  const query = parseSearchParams(request.url, oauthCallbackQuery);
  const loginError = () =>
    NextResponse.redirect(
      `${siteUrl()}/connexion?error=oauth_failed&provider=github`,
    );

  const stateOk = await consumeOAuthState(query?.state ?? null);
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!stateOk || !query || !clientId || !clientSecret) return loginError();
  const { code } = query;

  try {
    const redirectUri = `${siteUrl()}/api/auth/github/callback`;
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) return loginError();
    const token = oauthTokenResponse.safeParse(await tokenRes.json());
    if (!token.success) return loginError();
    const { access_token } = token.data;

    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${access_token}`, "User-Agent": "KeyMine" },
    });
    if (!userRes.ok) return loginError();
    const parsedUser = githubUserResponse.safeParse(await userRes.json());
    if (!parsedUser.success) return loginError();
    const githubUser = parsedUser.data;

    await loginOrCreateOAuthUser("github", {
      providerId: String(githubUser.id),
      username: githubUser.login,
      avatarUrl: githubUser.avatar_url,
    });

    return NextResponse.redirect(siteUrl());
  } catch {
    return loginError();
  }
}
