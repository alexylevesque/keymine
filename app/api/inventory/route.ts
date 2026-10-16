import { NextResponse } from "next/server";
import { z } from "zod";
import { msg } from "@/lib/api-messages";
import { refusal, requireUser } from "@/lib/inventory-api";
import { AREAS } from "@/lib/inventory";
import {
  activateItem,
  craftInInventory,
  deactivateItem,
  discardItem,
  moveInInventory,
  readInventory,
} from "@/lib/inventory-store";

// Inventaire du compte connecté (fonctionnalité ajoutée). Le client envoie une intention, le serveur la
// valide (Zod, TECH-07) puis l'applique avec la logique de lib/inventory.ts.
const slotRef = z.object({ area: z.enum(AREAS), slot: z.number().int().min(-1).max(26) });

const body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("move"),
    from: slotRef,
    to: slotRef,
    count: z.number().int().min(1).max(64).optional(),
  }),
  z.object({ action: z.literal("craft") }),
  z.object({
    action: z.literal("discard"),
    from: slotRef.extend({ slot: z.number().int().min(0).max(26) }),
    count: z.number().int().min(1).max(64).optional(),
  }),
  z.object({ action: z.literal("use"), slot: z.number().int().min(0).max(26) }),
  z.object({ action: z.literal("unuse") }),
]);

export async function GET() {
  const who = await requireUser();
  if (who instanceof NextResponse) return who;
  return NextResponse.json(await readInventory(who.userId));
}

export async function POST(request: Request) {
  const who = await requireUser();
  if (who instanceof NextResponse) return who;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: await msg("bad_request") }, { status: 400 });
  const input = parsed.data;
  try {
    switch (input.action) {
      case "move":
        return NextResponse.json(
          await moveInInventory(who.userId, input.from, input.to, input.count),
        );
      case "craft": {
        const { view, result } = await craftInInventory(who.userId);
        return NextResponse.json({ ...view, crafted: result.item });
      }
      case "discard": {
        const { view, result } = await discardItem(who.userId, input.from, input.count);
        return NextResponse.json({ ...view, discarded: result });
      }
      case "use":
        return NextResponse.json(await activateItem(who.userId, input.slot));
      case "unuse":
        return NextResponse.json(await deactivateItem(who.userId));
    }
  } catch (error) {
    return refusal(error);
  }
}
