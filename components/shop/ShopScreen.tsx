"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ItemIcon } from "@/components/items/ItemIcon";
import { InfoButton, ItemInfoDialog } from "@/components/items/ItemInfoDialog";
import { formatNumber } from "@/lib/format";
import { useLanguage, type DictKey } from "@/lib/i18n";
import type { ShopView } from "@/lib/inventory-store";
import type { ItemId } from "@/lib/items";
import { itemName } from "@/lib/item-text";
import { levelFromXp } from "@/lib/xp";

// Boutique (fonctionnalité ajoutée) : 6 offres du jour propres à chaque compte, payées en XP, renouvelées
// à minuit (heure de Toronto) avec un compte à rebours. Le serveur décide du prix, du stock et de l'XP.

const RARITY_COLOR: Record<string, string> = {
  common: "#a8966e",
  uncommon: "#7fc45a",
  rare: "#5aa9f0",
  epic: "#c77dff",
};

const RARITY_BORDER: Record<string, string> = {
  common: "#5a4632",
  uncommon: "#3f7d24",
  rare: "#2b5c7a",
  epic: "#7a45b0",
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

  const xpIcon = (cls: string) => <ItemIcon item="xp_bottle" className={`shrink-0 ${cls}`} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="-mt-2 flex flex-wrap items-end justify-between gap-4">
        <span className="text-xl text-[#cdbf9c]">{t("shop.subtitle")}</span>
        <div className="flex flex-wrap gap-3">
          <div className="shop-wallet">
            <span className="shop-bob">{xpIcon("h-9 w-9")}</span>
            <div className="flex flex-col gap-1">
              <span className="font-pixel text-[7px] text-[#ffe08a]">{t("shop.wallet_xp")}</span>
              <span className="text-[32px] leading-none text-[#7fc45a]">
                {formatNumber(lang, view.xp)}
              </span>
              <span className="text-[17px] leading-none text-[#a8966e]">
                {t("shop.wallet_level", { level })}
              </span>
            </div>
          </div>
          <div className="shop-wallet">
            <svg
              width="36"
              height="36"
              viewBox="0 0 9 9"
              shapeRendering="crispEdges"
              aria-hidden="true"
              className="shop-hourglass"
            >
              <path fill="#9a6b3a" d="M1 0h7v1h-7zM1 8h7v1h-7z" />
              <path fill="#e8f4f8" d="M2 1h5v1h-5zM3 5h3v1h-3zM2 6h5v1h-5z" />
              <path fill="#f0b429" d="M3 2h3v1h-3zM4 3h1v2h-1zM2 7h5v1h-5z" />
            </svg>
            <div className="flex flex-col gap-1">
              <span className="font-pixel text-[7px] text-[#ffe08a]">{t("shop.wallet_reset")}</span>
              <span className="text-[32px] leading-none" aria-live="off">
                {countdown(view.resetsAt - now)}
              </span>
              <span className="text-[17px] leading-none text-[#a8966e]">
                {t("shop.wallet_left")}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div aria-live="polite">
        {error && (
          <p role="alert" className="shop-toast !border-l-[#b0281c] text-[#f39a8c]">
            {error}
          </p>
        )}
        {notice && (
          <p className="shop-toast">
            <span className="font-pixel text-[8px] text-[#ffe08a]">{t("shop.toast")}</span>
            <span>{notice}</span>
            <Link
              href="/inventaire"
              className="font-pixel ml-auto border-3 border-black bg-[#f0b429] px-2.5 py-2 text-[8px] text-[#1b1209]"
            >
              {t("shop.to_inventory")}
            </Link>
          </p>
        )}
      </div>

      <ul className="grid list-none grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
        {view.offers.map((offer, i) => {
          const left = offer.stock - offer.bought;
          const missing = offer.price - view.xp;
          const after = levelFromXp(view.xp - offer.price).level;
          const rc = RARITY_COLOR[offer.rarity] ?? "#a8966e";
          const rb = RARITY_BORDER[offer.rarity] ?? "#5a4632";
          const sold = left <= 0;
          return (
            <li
              key={offer.slot}
              className={`shop-card ${sold ? "shop-sold" : ""}`}
              style={{ borderTopColor: rb, animationDelay: `${i * 0.07}s` }}
            >
              <span className="shop-rar font-pixel" style={{ color: rc, borderColor: rb }}>
                {t(`rarity.${offer.rarity}` as DictKey)
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .toUpperCase()}
              </span>
              <div className="shop-show">
                <span className="shop-ped" />
                <span className="shop-itm" style={{ animationDelay: `${i * 0.2}s` }}>
                  <ItemIcon item={offer.item} className="h-[72px] w-[72px]" />
                  {offer.count > 1 && <span className="font-pixel shop-qty">x{offer.count}</span>}
                </span>
                {sold && <span className="font-pixel shop-stamp">{t("shop.sold_out")}</span>}
                <span className="shop-info">
                  <InfoButton item={offer.item} onOpen={() => setInfo(offer.item)} />
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <h2 className="text-[28px] leading-none text-white">
                  {itemName(t, offer.item)}
                  {offer.count > 1 && ` ${t("shop.lot", { count: offer.count })}`}
                </h2>
                <span className="flex items-center justify-between gap-2">
                  <span className="shop-pips" aria-hidden="true">
                    {Array.from({ length: offer.stock }, (_, k) => (
                      <i key={k} style={k < left ? { background: rc } : undefined} />
                    ))}
                  </span>
                  <span className="text-lg whitespace-nowrap text-[#a8966e]">
                    {sold ? t("shop.none_left") : t("shop.left", { n: left })}
                  </span>
                </span>
              </div>
              {sold ? (
                <span className="font-pixel shop-soldb">{t("shop.sold_out")}</span>
              ) : (
                <button
                  type="button"
                  disabled={missing > 0 || busy !== null}
                  onClick={() => void buy(offer.slot, offer.item)}
                  className="shop-buy font-pixel"
                >
                  {xpIcon("h-5 w-5")}
                  <span>{t("shop.buy_price", { price: formatNumber(lang, offer.price) })}</span>
                </button>
              )}
              <span
                className={`text-center text-[17px] ${missing > 0 && !sold ? "text-[#f39a8c]" : "text-[#a8966e]"} ${sold ? "invisible" : ""}`}
              >
                {missing > 0
                  ? t("shop.too_poor", { missing: formatNumber(lang, missing) })
                  : t("shop.after", { level: after })}
              </span>
            </li>
          );
        })}
      </ul>

      <ItemInfoDialog item={info} onClose={() => setInfo(null)} />
    </div>
  );
}
