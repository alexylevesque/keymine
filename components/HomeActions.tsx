"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PixelButton } from "./ui";
import { useRoomEntry } from "./useRoomEntry";
import { PlayRunner } from "./home/PlayRunner";
import { useLanguage } from "@/lib/i18n";
import { useViewer } from "@/lib/viewer";
import { identicon } from "@/lib/identicon";

/** JOIN-03: bouton « Faire une course » (partie rapide). */
export function QuickPlayButton({ className }: { className?: string }) {
  const router = useRouter();
  const { t } = useLanguage();
  const { run, pending, panel } = useRoomEntry((code) => router.push(`/jouer/${code}`));

  // Le bonhomme prend la couleur de l'avatar du joueur.
  const viewer = useViewer();
  const color = viewer ? identicon(viewer.name).color : undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => void run(() => fetch("/api/play/quick", { method: "POST" }))}
        className={`home-play font-pixel ${className ?? ""}`}
      >
        {pending ? "..." : t("home.play")}
        <PlayRunner color={color} armored={viewer?.kind === "user"} />
      </button>
      {panel}
    </>
  );
}

/** JOIN-01: rejoindre par code depuis la page d'accueil. */
export function JoinByCodeForm() {
  const router = useRouter();
  const { t } = useLanguage();
  const [code, setCode] = useState("");
  const { run, pending, panel } = useRoomEntry((entered) => router.push(`/jouer/${entered}`));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    void run(async () => {
      const res = await fetch(`/api/lobbies/${trimmed}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      // On renvoie le code de la salle pour que le hook sache où naviguer.
      const body = (await res
        .clone()
        .json()
        .catch(() => ({}))) as Record<string, unknown>;
      return res.ok
        ? new Response(JSON.stringify({ ...body, code: trimmed }), { status: 200 })
        : res;
    });
  }

  return (
    <>
      <form className="flex flex-col gap-2" onSubmit={onSubmit}>
        <label htmlFor="home-code" className="font-pixel text-[10px] text-[#ffe08a]">
          {t("home.code_title")}
        </label>
        <div className="flex gap-2.5">
          <input
            id="home-code"
            aria-label={t("entry.code_label")}
            placeholder={t("entry.code_placeholder")}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={8}
            className="home-code font-pixel h-14 min-w-0 flex-auto px-4 text-lg tracking-[6px]"
          />
          <PixelButton variant="gold" type="submit" className="h-14 shrink-0 px-5 text-xs">
            {pending ? "..." : t("entry.join")}
          </PixelButton>
        </div>
      </form>
      {panel}
    </>
  );
}
