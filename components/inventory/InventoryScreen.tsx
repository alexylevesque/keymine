"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
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
import { itemName } from "@/lib/item-text";

// Inventaire façon Minecraft (fonctionnalité ajoutée) : armure, table de craft 3 × 3, four, sac de 27
// cases. On déplace un objet en le cliquant/touchant puis en touchant la case d'arrivée (marche aussi au
// clavier), ou en le glissant à la souris. Le serveur valide chaque déplacement.

type Amount = "all" | "half" | "one";

function amountOf(mode: Amount, count: number): number {
  if (mode === "one") return 1;
  if (mode === "half") return Math.max(1, Math.ceil(count / 2));
  return count;
}

const AREA_LABEL: Record<Area, DictKey> = {
  bag: "inv.bag",
  armor: "inv.armor",
  craft: "inv.craft",
  furnace_in: "inv.furnace_in",
  furnace_fuel: "inv.furnace_fuel",
  furnace_out: "inv.furnace_out",
};

export function InventoryScreen({ initial }: { initial: InventoryView }) {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [held, setHeld] = useState<SlotRef | null>(null);
  const [amount, setAmount] = useState<Amount>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [info, setInfo] = useState<Stack | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const discardDialog = useRef<HTMLDialogElement>(null);

  const inv = view.inventory;
  const stackAt = useCallback((ref: SlotRef): Slot => inv[ref.area][ref.slot] ?? null, [inv]);
  const heldStack = held ? stackAt(held) : null;

  const apply = useCallback(
    async (payload: unknown): Promise<(InventoryView & Record<string, unknown>) | null> => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch("/api/inventory", {
          method: payload ? "POST" : "GET",
          headers: payload ? { "content-type": "application/json" } : undefined,
          body: payload ? JSON.stringify(payload) : undefined,
        });
        const data = (await res.json().catch(() => ({}))) as InventoryView & {
          error?: string;
          crafted?: ItemId;
        };
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

  // Échap lâche l'objet tenu.
  useEffect(() => {
    if (!held) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !info && !discardDialog.current?.open) setHeld(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [held, info]);

  async function move(from: SlotRef, to: SlotRef) {
    const stack = stackAt(from);
    if (!stack) return;
    setHeld(null);
    await apply({
      action: "move",
      from,
      to,
      count: to.slot === -1 ? undefined : amountOf(amount, stack.count),
    });
  }

  function onSlot(ref: SlotRef) {
    if (busy) return;
    if (held) {
      if (held.area === ref.area && held.slot === ref.slot) setHeld(null);
      else void move(held, ref);
      return;
    }
    if (stackAt(ref)) setHeld(ref);
  }

  async function craftOnce() {
    const data = await apply({ action: "craft" });
    const crafted = data?.crafted as ItemId | undefined;
    if (crafted) setNotice(t("inv.crafted", { item: itemName(t, crafted) }));
  }

  async function discard() {
    if (!held || !heldStack) return;
    const from = held;
    const count = amountOf(amount, heldStack.count);
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

  async function activate(slot: number) {
    setHeld(null);
    await apply({ action: "use", slot });
  }

  const recipe = useMemo(() => findRecipe(inv.craft.map((s) => s?.item ?? null)), [inv.craft]);
  const loadout = computeLoadout(inv.armor, view.activeItem);
  const furnaceProgress = view.furnaceActive
    ? Math.min(1, (inv.furnace.progressMs + Math.max(0, now - fetchedAt)) / SMELT_MS)
    : 0;

  // Après un achat ou une course, l'XP de l'en-tête doit suivre.
  useEffect(() => {
    if (view.xp !== initial.xp) router.refresh();
  }, [view.xp, initial.xp, router]);

  const slot = (ref: SlotRef, extra?: { label?: string; placeholder?: ReactNode }) => (
    <InventorySlot
      key={`${ref.area}-${ref.slot}`}
      refKey={ref}
      stack={stackAt(ref)}
      held={!!held && held.area === ref.area && held.slot === ref.slot}
      target={!!held && !(held.area === ref.area && held.slot === ref.slot)}
      label={`${extra?.label ?? t(AREA_LABEL[ref.area])}`}
      placeholder={extra?.placeholder}
      onClick={() => onSlot(ref)}
      onDragStart={() => setHeld(ref)}
      onDrop={() => held && void move(held, ref)}
      onInfo={(s) => setInfo(s)}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xl text-[#f1e6c9]">{t("inv.hint")}</p>

      <div className="grid gap-6 pb-48 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:pb-0">
        <div className="flex min-w-0 flex-col gap-6">
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
                  {view.activeItem ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="pixel-slot flex h-12 w-12 items-center justify-center">
                        <ItemIcon item={view.activeItem} className="h-9 w-9" />
                      </span>
                      <span>{t("inv.active_item", { item: itemName(t, view.activeItem) })}</span>
                      <PixelButton
                        variant="slate"
                        disabled={busy}
                        onClick={() => void apply({ action: "unuse" })}
                        className="h-9 px-3 text-[9px]"
                      >
                        {t("inv.unuse")}
                      </PixelButton>
                    </div>
                  ) : (
                    <p className="text-xl text-[#3a3a3a]">{t("inv.active_none")}</p>
                  )}
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
            <h2 className="font-pixel mb-3 text-sm text-[#2b2b2b]">{t("inv.bag")}</h2>
            <div className="grid max-w-[33rem] grid-cols-9 gap-1">
              {Array.from({ length: 27 }, (_, i) => slot({ area: "bag", slot: i }))}
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
                        <span
                          key={i}
                          className="pixel-slot flex h-7 w-7 items-center justify-center"
                        >
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
        </div>
        {/* Panneau « En main » : toujours au même endroit (colonne à droite en grand écran, barre collée en
            bas en petit écran) pour que rien ne bouge quand on prend un objet. */}
        <aside
          aria-label={t("inv.held_title")}
          className="pixel-panel fixed inset-x-0 bottom-0 z-30 flex max-h-[45vh] flex-col gap-3 overflow-y-auto p-3 lg:sticky lg:top-4 lg:bottom-auto lg:max-h-none lg:overflow-visible"
        >
          <h2 className="font-pixel text-xs text-[#2b2b2b]">{t("inv.held_title")}</h2>
          {heldStack && held ? (
            <>
              <span className="flex items-center gap-2 text-2xl leading-tight text-[#2b2b2b]">
                <span className="pixel-slot flex h-12 w-12 shrink-0 items-center justify-center">
                  <ItemIcon item={heldStack.item} className="h-9 w-9" />
                </span>
                {t("inv.selected", {
                  item: itemName(t, heldStack.item),
                  count: amountOf(amount, heldStack.count),
                })}
              </span>
              {heldStack.count > 1 && (
                <span role="group" aria-label={t("inv.amount")} className="flex gap-1">
                  {(["all", "half", "one"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={amount === mode}
                      onClick={() => setAmount(mode)}
                      className="pixel-btn h-9 px-2 text-[9px]"
                      data-variant={amount === mode ? "green" : "slate"}
                    >
                      {t(
                        mode === "all"
                          ? "inv.amount_all"
                          : mode === "half"
                            ? "inv.amount_half"
                            : "inv.amount_one",
                      )}
                    </button>
                  ))}
                </span>
              )}
              <span className="flex flex-wrap gap-2">
                {held.area === "bag" && armorInfo(heldStack.item) && (
                  <PixelButton
                    onClick={() => void move(held, { area: "bag", slot: -1 })}
                    className="h-9 px-3 text-[9px]"
                  >
                    {t("inv.equip")}
                  </PixelButton>
                )}
                {held.area === "bag" && (canSmelt(heldStack.item) || heldStack.item === "coal") && (
                  <PixelButton
                    onClick={() => void move(held, { area: "bag", slot: -1 })}
                    className="h-9 px-3 text-[9px]"
                  >
                    {t("inv.to_furnace")}
                  </PixelButton>
                )}
                {held.area === "bag" && isConsumable(heldStack.item) && !view.activeItem && (
                  <PixelButton
                    variant="gold"
                    onClick={() => void activate(held.slot)}
                    className="h-9 px-3 text-[9px]"
                  >
                    {t("inv.use")}
                  </PixelButton>
                )}
                {held.area !== "bag" && (
                  <PixelButton
                    onClick={() => void move(held, { area: "bag", slot: -1 })}
                    className="h-9 px-3 text-[9px]"
                  >
                    {t("inv.to_bag")}
                  </PixelButton>
                )}
                <PixelButton
                  variant="slate"
                  onClick={() => setInfo(heldStack)}
                  className="h-9 px-3 text-[9px]"
                >
                  (i)
                </PixelButton>
                <PixelButton
                  variant="red"
                  onClick={() => discardDialog.current?.showModal()}
                  className="h-9 px-3 text-[9px]"
                >
                  {t("inv.discard")}
                </PixelButton>
                <PixelButton
                  variant="slate"
                  onClick={() => setHeld(null)}
                  className="h-9 px-3 text-[9px]"
                >
                  {t("inv.cancel")}
                </PixelButton>
              </span>
            </>
          ) : (
            <p className="text-xl leading-tight text-[#3a3a3a]">{t("inv.held_none")}</p>
          )}
          <div aria-live="polite">
            {error && (
              <p role="alert" className="text-xl leading-tight text-[#9b3a2e]">
                {error}
              </p>
            )}
            {notice && <p className="text-xl leading-tight text-[#23501a]">{notice}</p>}
          </div>
        </aside>
      </div>

      <dialog
        ref={discardDialog}
        aria-labelledby="discard-title"
        className="pixel-panel m-auto w-[calc(100%-2rem)] max-w-md p-5 backdrop:bg-black/70"
      >
        {heldStack && (
          <>
            <h2 id="discard-title" className="font-pixel mb-3 text-sm text-[#2b2b2b]">
              {t("inv.discard_title")}
            </h2>
            <div className="mb-4 flex items-center gap-3">
              <span className="pixel-slot flex h-12 w-12 shrink-0 items-center justify-center">
                <ItemIcon item={heldStack.item} className="h-9 w-9" />
              </span>
              <p className="text-2xl leading-tight text-[#2b2b2b]">
                {t("inv.discard_text", {
                  item: itemName(t, heldStack.item),
                  count: amountOf(amount, heldStack.count),
                  xp: discardXp(
                    heldStack.item,
                    amountOf(amount, heldStack.count),
                    heldStack.durability,
                  ),
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
        onClose={() => setInfo(null)}
      />
    </div>
  );
}

/** Motif d'armure ramené à 3 × 3 (le casque et les bottes n'ont que 2 lignes). */
function padPattern(lines: string[]): boolean[] {
  const rows = [...lines, ...Array<string>(3 - lines.length).fill("...")];
  return rows
    .join("")
    .split("")
    .map((c) => c === "X");
}

function InventorySlot({
  refKey,
  stack,
  held,
  target,
  label,
  placeholder,
  onClick,
  onDragStart,
  onDrop,
  onInfo,
}: {
  refKey: SlotRef;
  stack: Slot;
  held: boolean;
  target: boolean;
  label: string;
  placeholder?: ReactNode;
  onClick: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onInfo: (stack: Stack) => void;
}) {
  const { t } = useLanguage();
  const max = stack ? maxDurability(stack.item) : null;
  const content = stack ? `${itemName(t, stack.item)} × ${stack.count}` : t("inv.empty_slot");
  const allowDrop = (e: DragEvent) => {
    if (target) e.preventDefault();
  };
  return (
    <div className="relative aspect-square w-full max-w-14" data-area={refKey.area}>
      <button
        type="button"
        draggable={!!stack}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", `${refKey.area}:${refKey.slot}`);
          onDragStart();
        }}
        onDragOver={allowDrop}
        onDrop={(e) => {
          e.preventDefault();
          onDrop();
        }}
        onClick={onClick}
        aria-pressed={held}
        aria-label={t("inv.slot_label", { area: label, n: refKey.slot + 1, content })}
        data-held={held}
        data-target={target}
        className="pixel-slot inv-slot flex h-full w-full items-center justify-center"
      >
        {stack ? <ItemIcon item={stack.item} className="h-3/4 w-3/4" /> : placeholder}
        {stack && stack.count > 1 && <span className="inv-count">{stack.count}</span>}
        {stack && max !== null && stack.durability !== null && stack.durability < max && (
          <span
            className="inv-durability"
            style={{ ["--fill" as string]: `${(stack.durability / max) * 100}%` }}
          />
        )}
      </button>
      {stack && <InfoButton item={stack.item} onOpen={() => onInfo(stack)} />}
    </div>
  );
}
