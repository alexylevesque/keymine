import { ShopScreen } from "@/components/shop/ShopScreen";
import { PixelShell } from "@/components/PixelShell";
import { PixelButton, PixelPanel } from "@/components/ui";
import { peekIdentity } from "@/lib/auth/identity";
import { readShop } from "@/lib/inventory-store";
import { getRequestLang, pageMetadata } from "@/lib/i18n-server";
import { translate, type DictKey } from "@/lib/i18n-dictionary";

export const dynamic = "force-dynamic";
export const generateMetadata = pageMetadata("title.shop");

// Boutique (fonctionnalité ajoutée) : on paie en XP, donc réservée aux comptes.
export default async function BoutiquePage() {
  const lang = await getRequestLang();
  const t = (key: DictKey) => translate(lang, key);
  const identity = await peekIdentity();
  const title = (
    <h1 className="font-pixel mb-6 text-xl text-white [text-shadow:4px_4px_0_#000]">
      {t("shop.title")}
    </h1>
  );

  if (!identity || identity.kind !== "user") {
    return (
      <PixelShell active="boutique">
        {title}
        <PixelPanel className="p-6">
          <p className="mb-4 text-2xl">{t("shop.login")}</p>
          <PixelButton href="/connexion" variant="green" className="h-12 px-6 text-xs">
            {t("home.account")}
          </PixelButton>
        </PixelPanel>
      </PixelShell>
    );
  }

  return (
    <PixelShell active="boutique">
      {title}
      <ShopScreen initial={await readShop(identity.userId)} />
    </PixelShell>
  );
}
