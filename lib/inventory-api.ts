import "server-only";
import { NextResponse } from "next/server";
import { getIdentity } from "@/lib/auth/identity";
import { msg, type ErrorKey } from "@/lib/api-messages";
import { InventoryError } from "@/lib/inventory";
import { ItemRefusal, ShopRefusal } from "@/lib/inventory-store";

// Outils communs aux routes de l'inventaire et de la boutique : seul un compte en a un (les invités
// n'ont pas d'XP), et les refus de la logique deviennent des messages traduits (I18N-01).

export async function requireUser(): Promise<{ userId: string } | NextResponse> {
  const identity = await getIdentity();
  if (!identity || identity.kind !== "user") {
    return NextResponse.json(
      { error: await msg("login_required"), code: "account_required" },
      { status: 401 },
    );
  }
  return { userId: identity.userId };
}

const INVENTORY_KEYS: Record<InventoryError["code"], ErrorKey> = {
  bad_slot: "inv_bad_slot",
  empty_slot: "inv_empty_slot",
  not_allowed: "inv_not_allowed",
  full: "inv_full",
  no_recipe: "inv_no_recipe",
  not_usable: "inv_not_usable",
};

const ITEM_KEYS: Record<ItemRefusal["code"], ErrorKey> = {
  already_active: "inv_already_active",
  nothing_active: "inv_nothing_active",
  not_usable: "inv_not_usable",
  inventory_full: "inv_full",
};

const SHOP_KEYS: Record<ShopRefusal["code"], ErrorKey> = {
  offer_unknown: "shop_offer_unknown",
  sold_out: "shop_sold_out",
  not_enough_xp: "shop_not_enough_xp",
  inventory_full: "shop_inventory_full",
};

/** Un refus attendu (case invalide, XP insuffisante…) → 409 avec un message traduit ; le reste remonte. */
export async function refusal(error: unknown): Promise<NextResponse> {
  const key =
    error instanceof InventoryError
      ? INVENTORY_KEYS[error.code]
      : error instanceof ItemRefusal
        ? ITEM_KEYS[error.code]
        : error instanceof ShopRefusal
          ? SHOP_KEYS[error.code]
          : null;
  if (!key) throw error;
  return NextResponse.json({ error: await msg(key), code: key }, { status: 409 });
}
