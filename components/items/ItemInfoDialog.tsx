"use client";

import { useEffect, useRef } from "react";
import { PixelButton } from "@/components/ui";
import { useLanguage, type DictKey } from "@/lib/i18n";
import { itemDescription, itemFacts, itemName } from "@/lib/item-text";
import { isCurse, roman, type Enchant } from "@/lib/enchants";
import type { ItemId } from "@/lib/items";
import { ItemIcon } from "./ItemIcon";

// Fiche d'un objet, ouverte par le petit (i) de chaque case : nom, effet, rareté, prix, durabilité.
// <dialog> natif : le focus reste dans la fiche, Échap la ferme, le focus revient au bouton (i).

export function ItemInfoDialog({
  item,
  durability = null,
  enchants = [],
  onClose,
}: {
  item: ItemId | null;
  durability?: number | null;
  enchants?: Enchant[];
  onClose: () => void;
}) {
  const { t, lang } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (item && !d.open) d.showModal();
    if (!item && d.open) d.close();
  }, [item]);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="item-info-title"
      className="pixel-panel m-auto w-[calc(100%-2rem)] max-w-md p-5 backdrop:bg-black/70"
    >
      {item && (
        <>
          <div className="mb-3 flex items-center gap-3">
            <span className="pixel-slot flex h-14 w-14 shrink-0 items-center justify-center">
              <ItemIcon item={item} enchanted={enchants.length > 0} className="h-10 w-10" />
            </span>
            <h2 id="item-info-title" className="text-3xl leading-none text-[#2b2b2b]">
              {itemName(t, item)}
            </h2>
          </div>
          <p className="mb-3 text-2xl leading-tight text-[#2b2b2b]">
            {itemDescription(t, lang, item)}
          </p>
          {enchants.length > 0 && (
            <div className="mb-3">
              <p className="text-xl text-[#3a3a3a]">{t("info.enchants")}</p>
              <ul className="list-none text-xl leading-tight">
                {enchants.map((e) => (
                  <li key={e.id} className={isCurse(e.id) ? "text-[#9b3a2e]" : "text-[#5b2a86]"}>
                    {t(`ench.${e.id}` as DictKey)}
                    {!isCurse(e.id) && ` ${roman(e.level)}`} : {t(`ench_info.${e.id}` as DictKey)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="mb-4 list-none text-xl text-[#3a3a3a]">
            {itemFacts(t, item, durability).map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
          <PixelButton
            variant="slate"
            onClick={() => dialog.current?.close()}
            className="h-12 w-full text-[11px]"
          >
            {t("info.close")}
          </PixelButton>
        </>
      )}
    </dialog>
  );
}

/** Petit bouton (i) posé dans le coin d'une case. */
export function InfoButton({ item, onOpen }: { item: ItemId; onOpen: () => void }) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      className="item-info-btn"
      aria-label={t("info.open", { item: itemName(t, item) })}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      i
    </button>
  );
}
