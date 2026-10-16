// Textes des objets (nom, description, rareté, prix) à partir du dictionnaire (I18N-01).
import type { DictKey, SiteLang } from "./i18n-dictionary";
import { formatPercent } from "./format";
import {
  armorInfo,
  DODGE_PER_PIECE,
  FULL_SET_DODGE,
  GOLD_FULL_SET_XP,
  GOLD_XP_PER_PIECE,
  maxDurability,
  maxStack,
  rarityOf,
  shopPrice,
  type ItemId,
} from "./items";

type T = (key: DictKey, params?: Record<string, string | number>) => string;

export function itemName(t: T, item: ItemId): string {
  const armor = armorInfo(item);
  if (armor) {
    return t("inv.armor_name", {
      part: t(`part.${armor.part}` as DictKey),
      material: t(`mat.${armor.material}` as DictKey),
    });
  }
  return t(`item.${item}` as DictKey);
}

export function itemDescription(t: T, lang: SiteLang, item: ItemId): string {
  const armor = armorInfo(item);
  if (!armor) return t(`info.${item}` as DictKey);
  const pct = (n: number) => formatPercent(lang, n * 100);
  const part = t(`inv.slot_${armor.part}` as DictKey);
  if (armor.material === "gold") {
    return t("info.armor_gold", {
      part,
      dodge: pct(DODGE_PER_PIECE.gold),
      xp: pct(GOLD_XP_PER_PIECE),
      set: pct(GOLD_FULL_SET_XP),
    });
  }
  return t("info.armor", {
    part,
    dodge: pct(DODGE_PER_PIECE[armor.material]),
    set: pct(FULL_SET_DODGE),
  });
}

/** Lignes de la fiche d'information : rareté, prix en boutique, durabilité, taille des piles. */
export function itemFacts(t: T, item: ItemId, durability: number | null): string[] {
  const facts: string[] = [];
  const rarity = rarityOf(item);
  if (rarity) facts.push(t("info.rarity", { rarity: t(`rarity.${rarity}` as DictKey) }));
  const price = shopPrice(item);
  facts.push(
    price ? t("info.price", { count: price.count, price: price.price }) : t("info.not_sold"),
  );
  const max = maxDurability(item);
  if (max !== null) facts.push(t("info.durability", { left: durability ?? max, max }));
  if (maxStack(item) > 1) facts.push(t("info.stack", { max: maxStack(item) }));
  return facts;
}
