import { PixelShell } from "@/components/PixelShell";
import { PixelButton, PixelSlot } from "@/components/ui";
import { PublicLobbies } from "@/components/PublicLobbies";
import { listPublicLobbies } from "@/lib/public-lobbies";
import { JoinByCodeForm, QuickPlayButton } from "@/components/HomeActions";
import { db } from "@/lib/db";
import { peekIdentity } from "@/lib/auth/identity";
import { formatNumber, formatPercent } from "@/lib/format";
import { getRequestLang } from "@/lib/i18n-server";
import { translate, type DictKey } from "@/lib/i18n-dictionary";

export const dynamic = "force-dynamic";

async function getMiniStats() {
  const identity = await peekIdentity();
  if (!identity || identity.kind !== "user") return null;

  const user = await db
    .selectFrom("users")
    .select(["best_wpm", "total_races"])
    .where("id", "=", identity.userId)
    .executeTakeFirst();
  if (!user) return null;

  const acc = await db
    .selectFrom("race_participants")
    .select((eb) => eb.fn.avg<number>("accuracy").as("avg_accuracy"))
    .where("user_id", "=", identity.userId)
    .where("status", "=", "finished")
    .executeTakeFirst();

  return {
    bestWpm: Math.round(user.best_wpm),
    totalRaces: user.total_races,
    accuracy: acc?.avg_accuracy ? Math.round(acc.avg_accuracy) : null,
  };
}

export default async function Home() {
  const [lobbies, stats, lang] = await Promise.all([listPublicLobbies(), getMiniStats(), getRequestLang()]);
  const t = (key: DictKey, params?: Record<string, string | number>) => translate(lang, key, params);

  return (
    <PixelShell active="lobbys">
      <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-16">
        <div className="flex w-full flex-col gap-5 lg:w-[30rem] lg:flex-none">
          <h1 className="font-pixel text-3xl leading-relaxed text-white [text-shadow:4px_4px_0_#000]">
            {t("home.title")}
          </h1>
          <p className="text-2xl leading-tight text-[#f1e6c9]">{t("home.subtitle")}</p>

          <QuickPlayButton className="h-24 text-3xl" />
          <p className="-mt-2 text-xl text-[#f1e6c9]">{t("home.quickplay_hint")}</p>

          <JoinByCodeForm />

          <div className="flex gap-3">
            <PixelButton href="/jouer/creer" variant="gold" className="flex-grow text-sm">
              {t("home.create")}
            </PixelButton>
            <PixelButton href="/connexion" variant="slate" className="flex-grow text-sm">
              {t("home.account")}
            </PixelButton>
          </div>
          <p className="text-xl text-[#c9bb98]">{t("home.guest_note")}</p>
        </div>

        <div className="flex w-full flex-grow flex-col gap-3">
          <PublicLobbies initial={lobbies} />

          <div className="mt-3 grid grid-cols-3 gap-2.5">
            <PixelSlot className="px-3 py-2">
              <div className="font-pixel text-[9px] text-[#fff6d6]">{t("home.stat_best")}</div>
              <div className="text-3xl text-white">{stats ? t("home.wpm_value", { value: formatNumber(lang, stats.bestWpm) }) : "—"}</div>
            </PixelSlot>
            <PixelSlot className="px-3 py-2">
              <div className="font-pixel text-[9px] text-[#fff6d6]">{t("home.stat_races")}</div>
              <div className="text-3xl text-white">{stats ? stats.totalRaces : "—"}</div>
            </PixelSlot>
            <PixelSlot className="px-3 py-2">
              <div className="font-pixel text-[9px] text-[#fff6d6]">{t("home.stat_accuracy")}</div>
              <div className="text-3xl text-white">
                {stats?.accuracy != null ? formatPercent(lang, stats.accuracy) : "—"}
              </div>
            </PixelSlot>
          </div>
        </div>
      </div>
    </PixelShell>
  );
}
