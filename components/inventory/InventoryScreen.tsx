"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ItemIcon } from "@/components/items/ItemIcon";
import { InfoButton, ItemInfoDialog } from "@/components/items/ItemInfoDialog";
import { PixelButton, PixelDisclosure, PixelPanel } from "@/components/ui";
import { formatPercent } from "@/lib/format";
import { useLanguage, type DictKey } from "@/lib/i18n";
import {
  ARMOR_PATTERNS,
  canSmelt,
  computeLoadout,
  findRecipe,
  SMELT_MS,
  type Area,
  type Slot,
  type SlotRef,
  type Stack,
} from "@/lib/inventory";
import type { InventoryView } from "@/lib/inventory-store";
import {
  ARMOR_PARTS,
  armorInfo,
  discardXp,
  isConsumable,
  maxDurability,
  type ItemId,
} from "@/lib/items";
import { enchantList, itemName } from "@/lib/item-text";
import type { Enchant } from "@/lib/enchants";
import { levelFromXp } from "@/lib/xp";

// Inventaire façon Minecraft (fonctionnalité ajoutée) : armure, table de craft 3 × 3, four, sac de 27
// cases, poubelle et case « prochaine course ». Comme dans Minecraft, l'objet pris suit la souris :
//   clic (toucher, Entrée)            : prendre toute la pile / poser tout ce qu'on tient ;
//   clic droit (appui long, Maj+Entrée) : prendre la moitié / poser un seul objet ;
//   Maj + clic                        : envoyer directement à sa place (équiper, four, ranger).
// Le serveur valide chaque déplacement.

const AREA_LABEL: Record<Area, DictKey> = {
  bag: "inv.bag",
  armor: "inv.armor",
  craft: "inv.craft",
  furnace_in: "inv.furnace_in",
  furnace_fuel: "inv.furnace_fuel",
  furnace_out: "inv.furnace_out",
  enchant: "inv.enchant_slot",
};

/** Objet tenu : une partie (ou toute) la pile d'une case ; il y reste tant qu'on ne l'a pas posé. */
type Held = { from: SlotRef; count: number };

const LONG_PRESS_MS = 450;

const same = (a: SlotRef, b: SlotRef) => a.area === b.area && a.slot === b.slot;

export function InventoryScreen({ initial }: { initial: InventoryView }) {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [heldRaw, setHeld] = useState<Held | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [info, setInfo] = useState<Stack | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const discardDialog = useRef<HTMLDialogElement>(null);
  const follower = useRef<HTMLDivElement>(null);

  const inv = view.inventory;
  const stackAt = useCallback((ref: SlotRef): Slot => inv[ref.area][ref.slot] ?? null, [inv]);
  // Si la pile d'origine a changé (four, autre onglet), on ne tient jamais plus que ce qu'elle contient.
  const heldStack = heldRaw ? stackAt(heldRaw.from) : null;
  const held: Held | null =
    heldRaw && heldStack
      ? { from: heldRaw.from, count: Math.min(heldRaw.count, heldStack.count) }
      : null;

  const apply = useCallback(
    async (payload: unknown): Promise<(InventoryView & Record<string, unknown>) | null> => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/inventory", {
          method: payload ? "POST" : "GET",
          headers: payload ? { "content-type": "application/json" } : undefined,
          body: payload ? JSON.stringify(payload) : undefined,
        });
        const data = (await res.json().catch(() => ({}))) as InventoryView & { error?: string };
        if (!res.ok) {
          setError(data.error ?? t("err.generic"));
          return null;
        }
        setView(data);
        setFetchedAt(Date.now());
        return data;
      } catch {
        setError(t("err.generic"));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  // Les messages s'affichent par-dessus la page (rien ne bouge) et s'effacent seuls.
  useEffect(() => {
    if (!error && !notice) return;
    const timer = setTimeout(() => {
      setError(null);
      setNotice(null);
    }, 4_000);
    return () => clearTimeout(timer);
  }, [error, notice]);

  // Le four cuit même page fermée ; page ouverte, on anime la flèche et on relit l'état toutes les 2 s.
  useEffect(() => {
    if (!view.furnaceActive) return;
    const tick = setInterval(() => setNow(Date.now()), 200);
    const poll = setInterval(() => void apply(null), 2_000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [view.furnaceActive, apply]);

  // Dernière position du doigt ou de la souris : l'objet pris y apparaît tout de suite.
  useEffect(() => {
    const onDown = (e: PointerEvent) => setPointer({ x: e.clientX, y: e.clientY });
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  // L'objet tenu suit la souris (ou s'affiche là où on a touché). Échap le repose.
  useEffect(() => {
    if (!heldRaw) return;
    // Déplacé directement (sans nouveau rendu de tout l'inventaire) pour suivre la souris sans retard.
    const onMove = (e: PointerEvent) => {
      const el = follower.current;
      if (el) el.style.transform = `translate(${e.clientX - 24}px, ${e.clientY - 24}px)`;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !info && !discardDialog.current?.open) setHeld(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [heldRaw, info]);

  async function place(to: SlotRef, count: number) {
    if (!held) return;
    const from = held.from;
    const left = held.count - count;
    setHeld(left > 0 ? { from, count: left } : null);
    const ok = await apply({ action: "move", from, to, count });
    if (!ok) setHeld(null);
  }

  /** Clic gauche, toucher ou Entrée. Maj : rangement automatique. */
  function primary(ref: SlotRef, shift: boolean) {
    if (busy) return;
    const stack = stackAt(ref);
    if (!held) {
      if (!stack) return;
      if (shift) void quickMove(ref, stack);
      else setHeld({ from: ref, count: stack.count });
      return;
    }
    if (same(held.from, ref))
      setHeld(null); // reposé à sa place
    else void place(ref, held.count);
  }

  /**
   * Maj + clic : envoie l'objet à sa place. Depuis le sac : l'armure s'équipe, le minerai et le charbon
   * vont au four, un objet à usage unique va dans « prochaine course ». Ailleurs : retour au sac.
   * Sans place logique (lingot, diamant…), rien ne se passe, comme dans Minecraft.
   */
  function quickMove(ref: SlotRef, stack: Stack) {
    if (ref.area !== "bag") {
      void apply({ action: "move", from: ref, to: { area: "bag", slot: -1 } });
    } else if (armorInfo(stack.item) || canSmelt(stack.item) || stack.item === "coal") {
      void apply({ action: "move", from: ref, to: { area: "bag", slot: -1 } });
    } else if (isConsumable(stack.item)) {
      if (view.activeItem) setError(t("err.inv_already_active"));
      else void apply({ action: "use", slot: ref.slot });
    }
  }

  /** Clic droit, appui long ou Maj + Entrée : prendre la moitié, ou poser un seul objet. */
  function secondary(ref: SlotRef) {
    if (busy) return;
    const stack = stackAt(ref);
    if (!held) {
      if (stack) setHeld({ from: ref, count: Math.ceil(stack.count / 2) });
      return;
    }
    // Sur la case d'origine, poser un objet revient à le remettre : on en tient un de moins.
    if (same(held.from, ref))
      setHeld(held.count > 1 ? { from: held.from, count: held.count - 1 } : null);
    else void place(ref, 1);
  }

  async function enchant(option: number) {
    const data = (await apply({ action: "enchant", option })) as
      (InventoryView & { enchanted?: { item: ItemId; enchants: Enchant[] } }) | null;
    if (data?.enchanted) {
      setNotice(t("inv.enchanted", { list: enchantList(t, data.enchanted.enchants) }));
    }
  }

  // On peut fabriquer ou enchanter en tenant un objet (comme poser 1 lingot puis cliquer le résultat).
  async function craftOnce() {
    const data = await apply({ action: "craft" });
    const crafted = data?.crafted as ItemId | undefined;
    if (crafted) setNotice(t("inv.crafted", { item: itemName(t, crafted) }));
  }

  /** Case « prochaine course » : y déposer un objet à usage unique l'active ; vide, la cliquer le reprend. */
  async function onActiveSlot() {
    if (busy) return;
    if (!held) {
      if (view.activeItem) await apply({ action: "unuse" });
      return;
    }
    if (held.from.area !== "bag" || !heldStack || !isConsumable(heldStack.item)) {
      setError(t("err.inv_not_usable"));
      return;
    }
    if (view.activeItem) {
      setError(t("err.inv_already_active"));
      return;
    }
    const slot = held.from.slot;
    setHeld(null);
    await apply({ action: "use", slot });
  }

  async function discard() {
    if (!held || !heldStack) return;
    const { from, count } = held;
    discardDialog.current?.close();
    setHeld(null);
    const data = (await apply({ action: "discard", from, count })) as
      (InventoryView & { discarded?: { item: ItemId; count: number; xp: number } }) | null;
    if (data?.discarded) {
      setNotice(
        t("inv.discarded", {
          item: itemName(t, data.discarded.item),
          count: data.discarded.count,
          xp: data.discarded.xp,
        }),
      );
    }
  }

  const level = levelFromXp(view.xp).level;
  const recipe = useMemo(() => findRecipe(inv.craft.map((s) => s?.item ?? null)), [inv.craft]);
  const loadout = computeLoadout(inv.armor, view.activeItem);
  const furnaceProgress = view.furnaceActive
    ? Math.min(1, (inv.furnace.progressMs + Math.max(0, now - fetchedAt)) / SMELT_MS)
    : 0;

  // Après un achat ou une course, l'XP de l'en-tête doit suivre.
  useEffect(() => {
    if (view.xp !== initial.xp) router.refresh();
  }, [view.xp, initial.xp, router]);

  const press = usePress();

  const slot = (ref: SlotRef, extra?: { label?: string; placeholder?: ReactNode }) => {
    const stack = stackAt(ref);
    const isSource = !!held && same(held.from, ref);
    // La case d'origine montre ce qui y reste pendant qu'on tient l'objet.
    const shown: Slot =
      stack && isSource
        ? stack.count - held.count > 0
          ? { ...stack, count: stack.count - held.count }
          : null
        : stack;
    return (
      <InventorySlot
        key={`${ref.area}-${ref.slot}`}
        refKey={ref}
        stack={shown}
        infoStack={shown}
        target={!!held}
        label={extra?.label ?? t(AREA_LABEL[ref.area])}
        placeholder={extra?.placeholder}
        handlers={press(
          (shift) => primary(ref, shift),
          () => secondary(ref),
        )}
        onInfo={(s) => setInfo(s)}
      />
    );
  };

  return (
    <div className="flex flex-col gap-6" onContextMenu={(e) => held && e.preventDefault()}>
      <p className="text-xl text-[#f1e6c9]">{t("inv.hint")}</p>

      <div className="grid gap-6 xl:grid-cols-2">
        <PixelPanel className="p-4">
          <h2 className="font-pixel mb-3 text-sm text-[#2b2b2b]">{t("inv.armor")}</h2>
          <div className="flex flex-wrap items-start gap-4">
            <div className="grid w-16 gap-1">
              {ARMOR_PARTS.map((part, i) =>
                slot(
                  { area: "armor", slot: i },
                  {
                    label: t(`inv.slot_${part}` as DictKey),
                    placeholder: (
                      <ItemIcon
                        item={`iron_${part}`}
                        className="h-3/4 w-3/4 opacity-25 grayscale"
                      />
                    ),
                  },
                ),
              )}
            </div>
            <div className="min-w-0 flex-1 text-2xl text-[#2b2b2b]">
              <p>
                {t("inv.stats", {
                  dodge: formatPercent(lang, loadout.dodge * 100),
                  xp: formatPercent(lang, loadout.xpBonus * 100),
                })}
              </p>
              <h3 className="font-pixel mt-4 mb-2 text-xs text-[#2b2b2b]">
                {t("inv.active_title")}
              </h3>
              <div className="flex items-center gap-3">
                <div className="relative aspect-square w-14 shrink-0">
                  <button
                    type="button"
                    onClick={() => void onActiveSlot()}
                    aria-label={
                      view.activeItem
                        ? `${t("inv.active_title")} : ${itemName(t, view.activeItem)} (${t("inv.unuse")})`
                        : t("inv.active_title")
                    }
                    data-target={!!held}
                    className="pixel-slot inv-slot flex h-full w-full items-center justify-center"
                  >
                    {view.activeItem ? (
                      <ItemIcon item={view.activeItem} className="h-3/4 w-3/4" />
                    ) : (
                      <ItemIcon
                        item="enchanted_golden_apple"
                        className="h-3/4 w-3/4 opacity-25 grayscale"
                      />
                    )}
                  </button>
                  {view.activeItem && (
                    <InfoButton
                      item={view.activeItem}
                      onOpen={() => setInfo({ item: view.activeItem!, count: 1, durability: null })}
                    />
                  )}
                </div>
                <p className="text-xl leading-tight text-[#3a3a3a]">
                  {view.activeItem
                    ? t("inv.active_item", { item: itemName(t, view.activeItem) })
                    : t("inv.active_none")}
                </p>
              </div>
            </div>
          </div>
        </PixelPanel>

        <PixelPanel className="p-4">
          <h2 className="font-pixel mb-3 text-sm text-[#2b2b2b]">{t("inv.craft")}</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid w-44 grid-cols-3 gap-1 sm:w-48">
              {Array.from({ length: 9 }, (_, i) => slot({ area: "craft", slot: i }))}
            </div>
            <span aria-hidden="true" className="pixel-arrow" />
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                disabled={!recipe || busy}
                onClick={() => void craftOnce()}
                aria-label={
                  recipe
                    ? `${t("inv.craft_button")} : ${itemName(t, recipe.result)}`
                    : t("inv.craft_result")
                }
                className="pixel-slot inv-slot flex h-16 w-16 items-center justify-center disabled:cursor-not-allowed"
              >
                {recipe && <ItemIcon item={recipe.result} className="h-3/4 w-3/4" />}
              </button>
              <PixelButton
                disabled={!recipe || busy}
                onClick={() => void craftOnce()}
                className="h-10 px-3 text-[9px]"
              >
                {t("inv.craft_button")}
              </PixelButton>
            </div>
          </div>
          {!recipe && <p className="mt-3 text-xl text-[#3a3a3a]">{t("inv.craft_none")}</p>}
        </PixelPanel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PixelPanel className="p-4">
          <h2 className="font-pixel mb-3 text-sm text-[#2b2b2b]">{t("inv.furnace")}</h2>
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid gap-1">
              <div className="w-14">{slot({ area: "furnace_in", slot: 0 })}</div>
              <span
                aria-hidden="true"
                className="pixel-flame mx-auto"
                data-on={view.furnaceActive}
              />
              <div className="w-14">{slot({ area: "furnace_fuel", slot: 0 })}</div>
            </div>
            <span
              role="progressbar"
              aria-label={t("inv.furnace")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(furnaceProgress * 100)}
              className="pixel-arrow"
              style={{ ["--fill" as string]: `${furnaceProgress * 100}%` }}
            />
            <div className="w-16">{slot({ area: "furnace_out", slot: 0 })}</div>
            <p className="min-w-48 flex-1 text-xl text-[#2b2b2b]">
              {view.furnaceActive
                ? t("inv.furnace_on", { left: inv.furnace.burnLeft || 8 })
                : t("inv.furnace_off")}
            </p>
          </div>
        </PixelPanel>

        <PixelPanel className="p-4">
          <h2 className="font-pixel mb-3 text-sm text-[#2b2b2b]">{t("inv.enchant")}</h2>
          <div className="flex flex-wrap items-start gap-4">
            <div className="w-16">
              {slot(
                { area: "enchant", slot: 0 },
                {
                  label: t("inv.enchant_slot"),
                  placeholder: (
                    <ItemIcon
                      item="diamond_chestplate"
                      className="h-3/4 w-3/4 opacity-25 grayscale"
                    />
                  ),
                },
              )}
            </div>
            {view.enchantOptions.length === 0 ? (
              <p className="min-w-48 flex-1 text-xl text-[#2b2b2b]">
                {inv.enchant[0]?.enchants?.length ? t("inv.enchant_done") : t("inv.enchant_none")}
              </p>
            ) : (
              <ol className="flex min-w-56 flex-1 list-none flex-col gap-2">
                {view.enchantOptions.map((option, i) => {
                  const locked = level < option.minLevel || level < option.cost;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        disabled={locked || busy}
                        onClick={() => void enchant(i)}
                        className="inv-enchant-option w-full text-left"
                      >
                        <span className="block text-2xl leading-tight">
                          {t("inv.enchant_option", { hint: enchantList(t, [option.hint]) })}
                        </span>
                        <span className="block text-lg leading-tight">
                          {t("inv.enchant_cost", { n: option.cost, min: option.minLevel })}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </PixelPanel>
      </div>

      <PixelPanel className="p-4">
        <h2 className="font-pixel mb-3 text-sm text-[#2b2b2b]">{t("inv.bag")}</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid w-full max-w-[33rem] grid-cols-9 gap-1">
            {Array.from({ length: 27 }, (_, i) => slot({ area: "bag", slot: i }))}
          </div>
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              disabled={!held}
              onClick={() => discardDialog.current?.showModal()}
              aria-label={t("inv.trash")}
              data-target={!!held}
              className="pixel-slot inv-slot inv-trash flex h-14 w-14 items-center justify-center disabled:cursor-default"
            >
              <TrashIcon />
            </button>
            <span className="font-pixel text-[9px] text-[#2b2b2b]">{t("inv.trash")}</span>
          </div>
        </div>
      </PixelPanel>

      <PixelDisclosure title={t("inv.recipes")}>
        <div className="flex flex-col gap-4 text-2xl text-[#2b2b2b]">
          <p>{t("inv.recipes_armor")}</p>
          <div className="flex flex-wrap gap-6">
            {ARMOR_PARTS.map((part) => (
              <figure key={part} className="flex flex-col items-center gap-1">
                <div className="grid grid-cols-3 gap-0.5" aria-hidden="true">
                  {padPattern(ARMOR_PATTERNS[part]).map((cell, i) => (
                    <span key={i} className="pixel-slot flex h-7 w-7 items-center justify-center">
                      {cell && <ItemIcon item="iron_ingot" className="h-5 w-5" />}
                    </span>
                  ))}
                </div>
                <figcaption className="text-xl">{t(`part.${part}` as DictKey)}</figcaption>
              </figure>
            ))}
          </div>
          <p>{t("inv.recipes_netherite")}</p>
          <p>{t("inv.recipes_netherite_piece")}</p>
          <p>{t("inv.recipes_furnace")}</p>
        </div>
      </PixelDisclosure>

      {/* L'objet tenu, sous le curseur (style Minecraft). Rendu dans <body> : les panneaux de la page ont une
          animation de « transform », qui décalerait un élément « fixed » placé à l'intérieur. */}
      {held &&
        heldStack &&
        pointer &&
        createPortal(
          <div
            ref={follower}
            aria-hidden="true"
            className="pointer-events-none fixed top-0 left-0 z-40 h-12 w-12"
            style={{ transform: `translate(${pointer.x - 24}px, ${pointer.y - 24}px)` }}
          >
            <ItemIcon
              item={heldStack.item}
              enchanted={!!heldStack.enchants?.length}
              className="h-full w-full drop-shadow-[2px_2px_0_#000]"
            />
            {held.count > 1 && <span className="inv-count">{held.count}</span>}
          </div>,
          document.body,
        )}
      {/* Pour les lecteurs d'écran et le clavier : ce qu'on tient, annoncé sans rien afficher de plus. */}
      <p className="sr-only" aria-live="polite">
        {held && heldStack
          ? t("inv.selected", { item: itemName(t, heldStack.item), count: held.count })
          : ""}
      </p>

      {/* Messages par-dessus la page : rien ne bouge (rendus dans <body>, comme l'objet tenu). */}
      {(error || notice) &&
        createPortal(
          <div
            aria-live="polite"
            className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
          >
            <p
              role={error ? "alert" : undefined}
              className={`pixel-panel max-w-xl px-4 py-2 text-2xl leading-tight ${
                error ? "text-[#9b3a2e]" : "text-[#23501a]"
              }`}
            >
              {error ?? notice}
            </p>
          </div>,
          document.body,
        )}

      <dialog
        ref={discardDialog}
        aria-labelledby="discard-title"
        className="pixel-panel m-auto w-[calc(100%-2rem)] max-w-md p-5 backdrop:bg-black/70"
      >
        {held && heldStack && (
          <>
            <h2 id="discard-title" className="font-pixel mb-3 text-sm text-[#2b2b2b]">
              {t("inv.discard_title")}
            </h2>
            <div className="mb-4 flex items-center gap-3">
              <span className="pixel-slot flex h-12 w-12 shrink-0 items-center justify-center">
                <ItemIcon
                  item={heldStack.item}
                  enchanted={!!heldStack.enchants?.length}
                  className="h-9 w-9"
                />
              </span>
              <p className="text-2xl leading-tight text-[#2b2b2b]">
                {t("inv.discard_text", {
                  item: itemName(t, heldStack.item),
                  count: held.count,
                  xp: discardXp(heldStack.item, held.count, heldStack.durability),
                })}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <PixelButton
                variant="red"
                disabled={busy}
                onClick={() => void discard()}
                className="h-12 flex-1 text-[11px]"
              >
                {t("inv.discard_confirm")}
              </PixelButton>
              <PixelButton
                variant="slate"
                onClick={() => discardDialog.current?.close()}
                className="h-12 flex-1 text-[11px]"
              >
                {t("inv.cancel")}
              </PixelButton>
            </div>
          </>
        )}
      </dialog>

      <ItemInfoDialog
        item={info?.item ?? null}
        durability={info?.durability ?? null}
        enchants={info?.enchants ?? []}
        onClose={() => setInfo(null)}
      />
    </div>
  );
}

type PressHandlers = {
  onClick: (e: ReactMouseEvent) => void;
  onContextMenu: (e: ReactMouseEvent) => void;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onKeyDown: (e: ReactKeyboardEvent) => void;
};

/**
 * Clic, clic droit, appui long (téléphone : pas de clic droit) et Maj + Entrée (clavier), pour une case.
 * L'appui long annule le « toucher » qui suit, pour ne pas faire deux actions.
 */
function usePress() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const touch = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (primary: (shift: boolean) => void, secondary: () => void): PressHandlers => ({
    onPointerDown: (e) => {
      touch.current = e.pointerType === "touch" || e.pointerType === "pen";
      longPressed.current = false;
      clear();
      if (touch.current) {
        timer.current = setTimeout(() => {
          longPressed.current = true;
          secondary();
        }, LONG_PRESS_MS);
      }
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onClick: (e) => {
      if (longPressed.current) {
        longPressed.current = false;
        return;
      }
      primary(e.shiftKey);
    },
    onContextMenu: (e) => {
      e.preventDefault(); // pas de menu du navigateur dans l'inventaire
      if (!touch.current) secondary();
    },
    onKeyDown: (e) => {
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        secondary();
      }
    },
  });
}

/** Motif d'armure ramené à 3 × 3 (le casque et les bottes n'ont que 2 lignes). */
function padPattern(lines: string[]): boolean[] {
  const rows = [...lines, ...Array<string>(3 - lines.length).fill("...")];
  return rows
    .join("")
    .split("")
    .map((c) => c === "X");
}

/** Poubelle en pixels (dessin original). */
function TrashIcon() {
  const rows = [
    "................",
    "......OOOO......",
    "..OOOOOOOOOOOO..",
    "..OLLLLLLLLLLO..",
    "..OOOOOOOOOOOO..",
    "...OBDBDBDBDO...",
    "...OBDBDBDBDO...",
    "...OBDBDBDBDO...",
    "...OBDBDBDBDO...",
    "...OBDBDBDBDO...",
    "...OBDBDBDBDO...",
    "....OOOOOOOO....",
  ];
  const colors: Record<string, string> = { O: "#1a1a1a", L: "#b0b0b0", B: "#8a8a8a", D: "#5e5e5e" };
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges" className="h-3/4 w-3/4">
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) =>
          colors[ch] ? (
            <rect key={`${x}-${y}`} x={x} y={y + 2} width={1} height={1} fill={colors[ch]} />
          ) : null,
        ),
      )}
    </svg>
  );
}

function InventorySlot({
  refKey,
  stack,
  infoStack,
  target,
  label,
  placeholder,
  handlers,
  onInfo,
}: {
  refKey: SlotRef;
  /** Ce que la case montre (sans la partie tenue). */
  stack: Slot;
  /** Ce qui reste vraiment dans la case pendant qu'on tient l'objet, pour la fiche (i). */
  infoStack: Slot;
  target: boolean;
  label: string;
  placeholder?: ReactNode;
  handlers: PressHandlers;
  onInfo: (stack: Stack) => void;
}) {
  const { t } = useLanguage();
  const max = stack ? maxDurability(stack.item) : null;
  const content = stack
    ? `${itemName(t, stack.item)} × ${stack.count}${
        stack.enchants?.length ? ` (${enchantList(t, stack.enchants)})` : ""
      }`
    : t("inv.empty_slot");
  return (
    <div className="relative aspect-square w-full max-w-14" data-area={refKey.area}>
      <button
        type="button"
        {...handlers}
        aria-label={t("inv.slot_label", { area: label, n: refKey.slot + 1, content })}
        data-target={target}
        className="pixel-slot inv-slot flex h-full w-full items-center justify-center"
      >
        {stack ? (
          <ItemIcon
            item={stack.item}
            enchanted={!!stack.enchants?.length}
            className="h-3/4 w-3/4"
          />
        ) : (
          placeholder
        )}
        {stack && stack.count > 1 && <span className="inv-count">{stack.count}</span>}
        {stack && max !== null && stack.durability !== null && stack.durability < max && (
          <span
            className="inv-durability"
            style={{ ["--fill" as string]: `${(stack.durability / max) * 100}%` }}
          />
        )}
      </button>
      {infoStack && <InfoButton item={infoStack.item} onOpen={() => onInfo(infoStack)} />}
    </div>
  );
}
