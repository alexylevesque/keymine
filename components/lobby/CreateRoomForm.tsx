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
import { formatDuration } from "@/lib/format";
import { useTextPreview } from "./useTextPreview";

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
  // Deux étapes : les réglages, puis un aperçu du texte à accepter avant de créer la salle.
  const [step, setStep] = useState<"settings" | "preview">("settings");
  const [draw, setDraw] = useState(0);
  const preview = useTextPreview(settings, draw);

  /** Le nom est obligatoire : vérifié ici pour répondre tout de suite (le serveur refait le contrôle). */
  function nameError(): string | null {
    const problem = checkRoomName(normalizeRoomName(settings.name));
    return problem ? t(`err.${problem}` as const) : null;
  }

  function goToPreview() {
    const problem = nameError();
    setError(problem);
    if (problem) return;
    setStep("preview");
    window.scrollTo({ top: 0 });
  }

  async function createLobby() {
    const problem = nameError();
    setError(problem);
    if (problem) {
      setStep("settings");
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

  const complexity = t(`set.${settings.complexity}` as const);

  return (
    <div className="ui-dark">
      <h1 className="font-pixel mb-6 text-xl text-white [text-shadow:4px_4px_0_#000]">
        {t("create.title")}
      </h1>

      <div hidden={step !== "settings"}>
        <SettingsForm
          requireName
          compact
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
      </div>

      {step === "preview" && (
        <section aria-labelledby="create-preview" className="create-preview pixel-panel">
          <div className="create-preview-bar">
            <h2 id="create-preview" className="font-pixel text-[13px] text-white">
              {t("create.preview_title")}
            </h2>
            <button
              type="button"
              onClick={() => setDraw((n) => n + 1)}
              className="create-preview-other font-pixel"
            >
              {t("create.preview_other")}
            </button>
          </div>
          <p className="create-preview-name">{normalizeRoomName(settings.name)}</p>
          <ul className="create-preview-facts" aria-label={t("create.preview_facts")}>
            <li>{settings.language.toUpperCase()}</li>
            <li>{settings.textType === "aleatoire" ? t("set.text_random") : t("set.text_coherent")}</li>
            <li>{complexity}</li>
            <li>{t("create.preview_words", { count: settings.length })}</li>
            <li>{formatDuration(lang, settings.duration)}</li>
          </ul>
          <div data-testid="text-preview" className="create-preview-text">
            {preview ? (
              <>
                <span className="create-preview-cur">{preview.slice(0, 1)}</span>
                {preview.slice(1)}
              </>
            ) : (
              "…"
            )}
          </div>
          <p className="create-preview-note">{t("create.preview_note")}</p>
        </section>
      )}

      <div className="pixel-dark create-bar mt-8 flex flex-col items-center gap-4 border-t-4 border-black px-4 py-5 sm:flex-row sm:justify-between">
        <p className="text-2xl text-[#f1e6c9]">{error ?? t("create.hint")}</p>
        <div className="flex flex-wrap justify-center gap-3.5">
          {accountRequired && (
            <PixelButton href="/connexion" variant="gold" className="h-13 px-5 text-[13px]">
              {t("create.login")}
            </PixelButton>
          )}
          {step === "settings" ? (
            <>
              <PixelButton href="/" variant="slate" className="h-13 px-5 text-[13px]">
                {t("create.cancel")}
              </PixelButton>
              <PixelButton
                type="button"
                onClick={goToPreview}
                variant="green"
                className="h-13 px-4 text-[12px] whitespace-nowrap sm:px-7 sm:text-[15px]"
              >
                {t("create.continue")}
              </PixelButton>
            </>
          ) : (
            <>
              <PixelButton
                type="button"
                onClick={() => setStep("settings")}
                variant="slate"
                className="h-13 px-5 text-[13px]"
              >
                {t("create.back")}
              </PixelButton>
              <PixelButton
                type="button"
                onClick={createLobby}
                variant="green"
                className="h-13 px-4 text-[12px] whitespace-nowrap sm:px-7 sm:text-[15px]"
              >
                {pending ? "..." : t("create.submit")}
              </PixelButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
