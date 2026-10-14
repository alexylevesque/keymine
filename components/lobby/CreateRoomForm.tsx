"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PixelButton, PixelLabel } from "@/components/ui";
import { Chip, SettingsForm } from "./SettingsForm";
import { DEFAULT_SETTINGS, settingsToPayload, toggled, type SettingsState } from "./settings";
import { BOT_LEVELS } from "@/lib/race/bots";
import type { BotLevel } from "@/db/types";
import { useLanguage } from "@/lib/i18n";
import { checkRoomName, normalizeRoomName } from "@/lib/room-name";

export function CreateRoomForm({ defaultName = "" }: { defaultName?: string }) {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const [accountRequired, setAccountRequired] = useState(false);
  // CONF-02 : la langue du texte part de celle du site (modifiable, indépendante de l'interface ensuite).
  const [settings, setSettings] = useState<SettingsState>({
    ...DEFAULT_SETTINGS,
    language: lang,
    name: defaultName,
  });
  const [bots, setBots] = useState<BotLevel[]>(["intermediaire", "expert"]);
  const [hostRole, setHostRole] = useState<"participant" | "spectator">("participant");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createLobby() {
    setError(null);
    // Le nom est obligatoire : on le vérifie ici pour répondre tout de suite (le serveur refait le contrôle).
    const problem = checkRoomName(normalizeRoomName(settings.name));
    if (problem) {
      setError(t(`err.${problem}` as const));
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/lobbies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settingsToPayload(settings), hostRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        // AUTH-03: un invité ne peut pas créer de salle.
        setAccountRequired(data.code === "account_required");
        if (data.code === "already_in_room") {
          router.push(`/jouer/${data.currentCode}`);
          return;
        }
        setError(
          data.code === "account_required"
            ? t("create.account_required")
            : (data.error ?? t("err.generic")),
        );
        return;
      }

      for (const level of bots) {
        await fetch(`/api/lobbies/${data.code}/bots`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ level }),
        });
      }

      router.push(`/jouer/${data.code}`);
    } catch {
      setError(t("err.network"));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <h1 className="font-pixel mb-6 text-xl text-white [text-shadow:4px_4px_0_#000]">
        {t("create.title")}
      </h1>

      <SettingsForm
        requireName
        value={settings}
        onChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
        leftExtra={
          <>
            <div>
              <PixelLabel>{t("create.role")}</PixelLabel>
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
                {(
                  [
                    ["participant", t("create.role_participant"), t("create.role_participant_sub")],
                    ["spectator", t("create.role_spectator"), t("create.role_spectator_sub")],
                  ] as const
                ).map(([key, title, sub]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setHostRole(key)}
                    data-on={hostRole === key}
                    aria-pressed={hostRole === key}
                    className="pixel-chip flex flex-col items-start gap-1 leading-tight"
                  >
                    <b className="font-pixel text-[11px] font-normal">{title}</b>
                    <span className="text-lg">{sub}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <PixelLabel>{t("create.bots", { count: bots.length })}</PixelLabel>
              <div className="flex flex-wrap gap-2">
                {BOT_LEVELS.map((lvl) => (
                  <Chip
                    key={lvl}
                    on={bots.includes(lvl)}
                    onClick={() => setBots(toggled(bots, lvl))}
                  >
                    {t(`bot.${lvl}`).toUpperCase()}
                  </Chip>
                ))}
              </div>
            </div>
          </>
        }
      />

      <div className="pixel-dark mt-8 flex flex-col items-center gap-4 border-t-4 border-black bg-[#241a10] px-4 py-5 sm:flex-row sm:justify-between">
        <p className="text-2xl text-[#f1e6c9]">{error ?? t("create.hint")}</p>
        <div className="flex gap-3.5">
          {accountRequired && (
            <PixelButton href="/connexion" variant="gold" className="h-13 px-5 text-[13px]">
              {t("create.login")}
            </PixelButton>
          )}
          <PixelButton href="/" variant="slate" className="h-13 px-5 text-[13px]">
            {t("create.cancel")}
          </PixelButton>
          <PixelButton
            type="button"
            onClick={createLobby}
            variant="green"
            className="h-13 px-7 text-[15px]"
          >
            {pending ? "..." : t("create.submit")}
          </PixelButton>
        </div>
      </div>
    </>
  );
}
