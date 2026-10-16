import { InventoryScreen } from "@/components/inventory/InventoryScreen";
import { PixelShell } from "@/components/PixelShell";
import { PixelButton, PixelPanel } from "@/components/ui";
import { peekIdentity } from "@/lib/auth/identity";
import { readInventory } from "@/lib/inventory-store";
import { getRequestLang, pageMetadata } from "@/lib/i18n-server";
import { translate, type DictKey } from "@/lib/i18n-dictionary";

export const dynamic = "force-dynamic";
export const generateMetadata = pageMetadata("title.inventory");

// Inventaire (fonctionnalité ajoutée) : réservé aux comptes, comme l'XP.
export default async function InventairePage() {
  const lang = await getRequestLang();
  const t = (key: DictKey) => translate(lang, key);
  const identity = await peekIdentity();
  const title = (
    <h1 className="font-pixel mb-6 text-xl text-white [text-shadow:4px_4px_0_#000]">
      {t("inv.title")}
    </h1>
  );

  if (!identity || identity.kind !== "user") {
    return (
      <PixelShell active="inventaire">
        {title}
        <PixelPanel className="p-6">
          <p className="mb-4 text-2xl">{t("inv.login")}</p>
          <PixelButton href="/connexion" variant="green" className="h-12 px-6 text-xs">
            {t("home.account")}
          </PixelButton>
        </PixelPanel>
      </PixelShell>
    );
  }

  return (
    <PixelShell active="inventaire">
      {title}
      <InventoryScreen initial={await readInventory(identity.userId)} />
    </PixelShell>
  );
}
