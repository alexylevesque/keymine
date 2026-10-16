import { NextResponse } from "next/server";
import { z } from "zod";
import { msg } from "@/lib/api-messages";
import { refusal, requireUser } from "@/lib/inventory-api";
import { buyOffer, readShop } from "@/lib/inventory-store";

// Boutique du compte connecté (fonctionnalité ajoutée) : 6 offres par jour, payées en XP.
const body = z.object({ slot: z.number().int().min(0).max(5) });

export async function GET() {
  const who = await requireUser();
  if (who instanceof NextResponse) return who;
  return NextResponse.json(await readShop(who.userId));
}

export async function POST(request: Request) {
  const who = await requireUser();
  if (who instanceof NextResponse) return who;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: await msg("bad_request") }, { status: 400 });
  try {
    return NextResponse.json(await buyOffer(who.userId, parsed.data.slot));
  } catch (error) {
    return refusal(error);
  }
}
