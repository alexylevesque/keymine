import { NextResponse } from "next/server";
import { getIdentity } from "@/lib/auth/identity";
import { isBanned } from "@/lib/bans";
import { clientIpFrom } from "@/lib/client-ip";
import { redeemInvite } from "@/lib/invites";
import { isJoinRateLimited, recordFailedJoin } from "@/lib/join-limit";
import { joinLobby } from "@/lib/lobby";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lobbies, lobbyInvites } from "@/db/schema";
import { msg } from "@/lib/api-messages";
import { inviteTokenSchema } from "@/lib/api-input";

const REFUSALS = {
  invalid: ["invite_invalid", 404],
  revoked: ["invite_revoked", 410],
  closed: ["lobby_closed", 410],
  wrong_ip: ["invite_wrong_ip", 403],
} as const;

// SALLE-04 : utilisation d'un lien d'invitation (usage unique, lié à l'IP).
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const parsedToken = inviteTokenSchema.safeParse((await params).token);
  const ip = clientIpFrom(request.headers);

  if (await isJoinRateLimited(ip)) {
    return NextResponse.json(
      { error: await msg("rate_limited"), code: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const identity = await getIdentity();
  if (!identity) {
    return NextResponse.json(
      { error: await msg("pseudo_required"), code: "pseudo_required" },
      { status: 401 },
    );
  }

  if (!parsedToken.success) {
    await recordFailedJoin(ip);
    return NextResponse.json(
      { error: await msg("invite_invalid"), code: "invalid" },
      { status: 404 },
    );
  }
  const token = parsedToken.data;

  const invite = await db.query.lobbyInvites.findFirst({
    columns: { lobby_id: true },
    where: eq(lobbyInvites.token, token),
  });
  if (invite && (await isBanned(invite.lobby_id, identity))) {
    return NextResponse.json({ error: await msg("banned"), code: "banned" }, { status: 403 });
  }

  const redeemed = await redeemInvite(token, identity, ip);
  if (!redeemed.ok) {
    await recordFailedJoin(ip);
    const [key, status] = REFUSALS[redeemed.reason];
    return NextResponse.json({ error: await msg(key), code: redeemed.reason }, { status });
  }

  const lobby = await db.query.lobbies.findFirst({ where: eq(lobbies.id, redeemed.lobbyId) });
  if (!lobby) throw new Error("invitation : salle introuvable");
  if (lobby.status === "countdown" || lobby.status === "racing") {
    return NextResponse.json(
      { error: await msg("race_in_progress"), code: "race_in_progress" },
      { status: 409 },
    );
  }
  const result = await joinLobby(lobby, identity);
  if (!result.ok) {
    if (result.reason === "already_in_room") {
      return NextResponse.json(
        {
          error: await msg("already_in_room"),
          code: "already_in_room",
          currentCode: result.currentCode,
        },
        { status: 409 },
      );
    }
    if (result.reason === "banned") {
      return NextResponse.json({ error: await msg("banned"), code: "banned" }, { status: 403 });
    }
    return NextResponse.json({ error: await msg("full"), code: "full" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, code: redeemed.lobbyCode });
}
