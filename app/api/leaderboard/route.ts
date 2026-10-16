import { NextResponse } from "next/server";
import { z } from "zod";
import { getIdentity } from "@/lib/auth/identity";
import { msg } from "@/lib/api-messages";
import { claimReward, RewardRefusal } from "@/lib/leaderboard";
import { loadLeaderboardView } from "@/lib/leaderboard-view";
import { parseSearchParams } from "@/lib/api-input";

// Classement (fonctionnalité ajoutée) : lecture ouverte à tous (invités compris), récupération d'une
// récompense réservée à son gagnant. Entrées validées par Zod (TECH-07).
const query = z.object({ league: z.coerce.number().int().min(0).max(4).optional() });
const body = z.object({ rewardId: z.uuid() });

export async function GET(request: Request) {
  const params = parseSearchParams(request.url, query);
  if (!params) return NextResponse.json({ error: await msg("bad_request") }, { status: 400 });
  const identity = await getIdentity();
  const userId = identity?.kind === "user" ? identity.userId : null;
  return NextResponse.json(await loadLeaderboardView(userId, params.league ?? null));
}

export async function POST(request: Request) {
  const identity = await getIdentity();
  if (!identity || identity.kind !== "user") {
    return NextResponse.json({ error: await msg("login_required") }, { status: 401 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: await msg("bad_request") }, { status: 400 });
  try {
    await claimReward(identity.userId, parsed.data.rewardId);
  } catch (error) {
    if (error instanceof RewardRefusal) {
      const key = error.code === "inventory_full" ? "reward_inventory_full" : "reward_unknown";
      return NextResponse.json({ error: await msg(key), code: key }, { status: 409 });
    }
    throw error;
  }
  return NextResponse.json(await loadLeaderboardView(identity.userId, null));
}
