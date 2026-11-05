"use client";

import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { PixelButton } from "@/components/ui";
import { HistoryIcon } from "@/components/history/icons";
import type { LobbyView } from "@/lib/lobby-snapshot";
import { useLanguage } from "@/lib/i18n";
import { checkRoomName, normalizeRoomName } from "@/lib/room-name";
import { SettingsForm } from "./SettingsForm";
import { settingsFromLobby, settingsToPayload, type SettingsState } from "./settings";

// CONF-12 : l'hôte modifie la configuration dans la salle d'attente ; les autres joueurs voient
// le changement en direct (notification Postgres → WebSocket).
// Fermer avec des changements non enregistrés ouvre une boîte de dialogue : « Annuler » abandonne
// les changements et ferme, « Sauvegarder » enregistre puis ferme.

export type HostSettingsEditorHandle = { requestClose: () => void };

export function HostSettingsEditor({
  code,
  lobby,
  onClose,
  handle,
}: {
  code: string;
  lobby: LobbyView["lobby"];
  onClose: () => void;
  /** Permet au bouton « Modifier / Fermer » de la page de demander la fermeture (avec confirmation). */
  handle?: Ref<HostSettingsEditorHandle>;
}) {
  const { t } = useLanguage();
  const [value, setValue] = useState<SettingsState>(() => settingsFromLobby(lobby));
  const [initialKey] = useState(() => JSON.stringify(settingsToPayload(settingsFromLobby(lobby))));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const dirty = JSON.stringify(settingsToPayload(value)) !== initialKey;

  function requestClose() {
    if (saving) return;
    if (dirty) dialog.current?.showModal();
    else onClose();
  }

  useImperativeHandle(handle, () => ({ requestClose }));

  async function save() {
    const problem = checkRoomName(normalizeRoomName(value.name));
    if (problem) {
      setError(t(`err.${problem}` as const));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/lobbies/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsToPayload(value)),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? t("err.generic"));
        return;
      }
      onClose();
    } catch {
      setError(t("err.network"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pixel-unfold mb-6" data-testid="settings-editor">
      <div className="pixel-unfold-inner">
        <div className="ui-dark lobby-panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-pixel text-sm text-white">{t("set.edit_title")}</h2>
            <button
              type="button"
              onClick={requestClose}
              aria-label={t("set.close")}
              className="shell-btn flex h-9 w-9 items-center justify-center"
            >
              <HistoryIcon name="close" />
            </button>
          </div>
          <SettingsForm
            value={value}
            requireName
            compact
            layout="numbered"
            onChange={(patch) => {
              setError(null);
              setValue((prev) => ({ ...prev, ...patch }));
            }}
          />
          {error && (
            <p role="alert" className="inv-toast inv-toast-err mt-4">
              {error}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            {dirty && <span className="mr-auto text-xl text-[#ffe08a]">{t("set.unsaved")}</span>}
            <PixelButton variant="slate" onClick={requestClose} className="h-12 px-5 text-[11px]">
              {t("set.close")}
            </PixelButton>
            <PixelButton
              variant="green"
              onClick={() => void save()}
              disabled={saving}
              className="h-12 px-6 text-[11px]"
            >
              {saving ? "..." : t("set.save")}
            </PixelButton>
          </div>
        </div>
      </div>

      <dialog
        ref={dialog}
        aria-labelledby="unsaved-title"
        className="pixel-panel m-auto w-full max-w-md p-6 backdrop:bg-black/70"
      >
        <h2 id="unsaved-title" className="font-pixel mb-3 text-sm text-[#2b2b2b]">
          {t("set.unsaved_title")}
        </h2>
        <p className="mb-4 text-2xl text-[#2b2b2b]">{t("set.unsaved_text")}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <PixelButton
            variant="slate"
            onClick={() => {
              dialog.current?.close();
              onClose();
            }}
            className="h-14 flex-1 text-[12px]"
          >
            {t("set.discard")}
          </PixelButton>
          <PixelButton
            variant="green"
            onClick={() => {
              dialog.current?.close();
              void save();
            }}
            className="h-14 flex-1 text-[12px]"
          >
            {t("set.save_close")}
          </PixelButton>
        </div>
      </dialog>
    </div>
  );
}
