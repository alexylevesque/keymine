"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PixelButton } from "@/components/ui";
import { useLanguage } from "@/lib/i18n";
import { HistoryIcon } from "./icons";

// Supprime une course de son historique, après confirmation (<dialog> natif : le focus est piégé
// dans la boîte et Échap la ferme).

export function DeleteHistoryButton({
  raceId,
  compactLabel,
}: {
  raceId: string;
  /** Tableau de l'historique : petit bouton « X » ; ce texte est son nom pour les lecteurs d'écran. */
  compactLabel?: string;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/history/${raceId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? t("err.generic"));
      return;
    }
    dialog.current?.close();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        data-variant="red"
        aria-label={compactLabel}
        title={compactLabel ? t("hist.delete") : undefined}
        className={compactLabel ? "hist-del font-pixel" : "pixel-btn h-10 gap-2 px-3 text-[9px]"}
      >
        {compactLabel ? (
          "X"
        ) : (
          <>
            <HistoryIcon name="trash" />
            {t("hist.delete")}
          </>
        )}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`delete-title-${raceId}`}
        className="pixel-panel m-auto w-full max-w-md p-6 backdrop:bg-black/70"
      >
        <h2 id={`delete-title-${raceId}`} className="font-pixel mb-3 text-sm text-[#2b2b2b]">
          {t("hist.delete_title")}
        </h2>
        <p className="mb-4 text-2xl text-[#2b2b2b]">{t("hist.delete_text")}</p>
        {error && (
          <p role="alert" className="mb-3 text-xl text-[#9b3a2e]">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <PixelButton
            variant="red"
            onClick={() => void confirm()}
            disabled={busy}
            className="h-14 flex-1 text-[12px]"
          >
            {t("hist.delete_confirm")}
          </PixelButton>
          <PixelButton
            variant="slate"
            onClick={() => dialog.current?.close()}
            className="h-14 flex-1 text-[12px]"
          >
            {t("hist.delete_cancel")}
          </PixelButton>
        </div>
      </dialog>
    </>
  );
}
