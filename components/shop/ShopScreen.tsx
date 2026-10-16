"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ItemIcon } from "@/components/items/ItemIcon";
import { InfoButton, ItemInfoDialog } from "@/components/items/ItemInfoDialog";
import { PixelButton, PixelPanel } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { useLanguage, type DictKey } from "@/lib/i18n";
import type { ShopView } from "@/lib/inventory-store";
import type { ItemId } from "@/lib/items";
import { itemName } from "@/lib/item-text";
import { levelFromXp } from "@/lib/xp";

// Boutique (fonctionnalité ajoutée) : 6 offres du jour propres à chaque compte, payées en XP, renouvelées
// à minuit (heure de Toronto) avec un compte à rebours. Le serveur décide du prix, du stock et de l'XP.

const RARITY_COLOR: Record<string, string> = {
  common: "#d9d9d9",
  uncommon: "#7fc45a",
  rare: "#5aa9f0",
  epic: "#c77dff",
};

/** Temps restant « 05:03:12 ». */
function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function ShopScreen({ initial }: { initial: ShopView }) {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const [view, setView] = useState(initial);
  // Décalage entre l'horloge du serveur et celle de l'appareil, pour un compte à rebours juste.
  const [skew] = useState(() => initial.serverNow - Date.now());
  const [now, setNow] = useState(() => Date.now() + skew);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [info, setInfo] = useState<ItemId | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + skew), 1_000);
    return () => clearInterval(timer);
  }, [skew]);

  // Minuit passé : nouvelles offres.
  const expired = now >= view.resetsAt;
  useEffect(() => {
    if (!expired) return;
    void fetch("/api/shop")
      .then((res) => (res.ok ? (res.json() as Promise<ShopView>) : null))
      .then((data) => data && setView(data));
  }, [expired]);

  async function buy(slot: number, item: ItemId) {
    setBusy(slot);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/shop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slot }),
      });
      const data = (await res.json().catch(() => ({}))) as ShopView & { error?: string };
      if (!res.ok) {
        setError(data.error ?? t("err.generic"));
        return;
      }
      setView(data);
      setNotice(t("shop.bought", { item: itemName(t, item) }));
      router.refresh(); // l'XP de l'en-tête
    } catch {
      setError(t("err.generic"));
    } finally {
      setBusy(null);
    }
  }

  const level = levelFromXp(view.xp).level;

  return (
    <div className="flex flex-col gap-6">
      <PixelPanel className="flex flex-wrap items-center justify-between gap-3 p-4 text-2xl text-[#2b2b2b]">
        <p>{t("shop.subtitle")}</p>
        <p>{t("shop.your_xp", { xp: formatNumber(lang, view.xp), level })}</p>
        <p aria-live="off">{t("shop.reset", { time: countdown(view.resetsAt - now) })}</p>
      </PixelPanel>

      <div aria-live="polite" className="min-h-8">
        {error && (
          <p role="alert" className="text-2xl text-[#f39a8c]">
            {error}
          </p>
        )}
        {notice && (
          <p className="flex flex-wrap items-center gap-3 text-2xl text-[#7fc45a]">
            {notice}
            <PixelButton href="/inventaire" variant="slate" className="h-9 px-3 text-[9px]">
              {t("shop.to_inventory")}
            </PixelButton>
          </p>
        )}
      </div>

      <ul className="grid list-none gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {view.offers.map((offer) => {
          const left = offer.stock - offer.bought;
          const missing = offer.price - view.xp;
          const after = levelFromXp(view.xp - offer.price).level;
          return (
            <li key={offer.slot}>
              <PixelPanel className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="relative h-16 w-16 shrink-0">
                    <span className="pixel-slot flex h-full w-full items-center justify-center">
                      <ItemIcon item={offer.item} className="h-3/4 w-3/4" />
                    </span>
                    {offer.count > 1 && <span className="inv-count">{offer.count}</span>}
                    <InfoButton item={offer.item} onOpen={() => setInfo(offer.item)} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-2xl leading-none text-[#2b2b2b]">
                      {itemName(t, offer.item)}
                      {offer.count > 1 && ` ${t("shop.lot", { count: offer.count })}`}
                    </h2>
                    <p className="text-xl" style={{ color: "#2b2b2b" }}>
                      <span
                        aria-hidden="true"
                        className="mr-2 inline-block h-3 w-3 border border-black align-middle"
                        style={{ background: RARITY_COLOR[offer.rarity] }}
                      />
                      {t(`rarity.${offer.rarity}` as DictKey)}
                    </p>
                  </div>
                </div>
                <p className="text-3xl text-[#2b2b2b]">
                  {t("shop.price", { price: formatNumber(lang, offer.price) })}
                </p>
                <p className="text-xl text-[#3a3a3a]">
                  {left > 0 ? t("shop.left", { n: left }) : t("shop.sold_out")}
                  {left > 0 &&
                    missing <= 0 &&
                    after < level &&
                    ` · ${t("shop.after", { level: after })}`}
                </p>
                {left > 0 && missing > 0 && (
                  <p className="text-xl text-[#9b3a2e]">
                    {t("shop.too_poor", { missing: formatNumber(lang, missing) })}
                  </p>
                )}
                <PixelButton
                  variant="gold"
                  disabled={left <= 0 || missing > 0 || busy !== null}
                  onClick={() => void buy(offer.slot, offer.item)}
                  className="mt-auto h-12 text-[11px]"
                >
                  {left > 0 ? t("shop.buy") : t("shop.sold_out")}
                </PixelButton>
              </PixelPanel>
            </li>
          );
        })}
      </ul>

      <ItemInfoDialog item={info} onClose={() => setInfo(null)} />
    </div>
  );
}
