"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n";
import { HistoryIcon } from "./icons";

// REJOUER : ouvre une nouvelle salle avec les mêmes réglages que cette course, puis y emmène l'hôte.

export function ReplayButton({ raceId, compact = false }: { raceId: string; compact?: boolean }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ text: string; currentCode?: string } | null>(null);

  async function replay() {
    setBusy(true);
    setProblem(null);
    const res = await fetch(`/api/history/${raceId}/replay`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as {
      code?: string;
      error?: string;
      currentCode?: string;
    };
    if (res.ok && data.code) {
      router.push(`/jouer/${data.code}`);
      return;
    }
    setBusy(false);
    setProblem({ text: data.error ?? t("err.generic"), currentCode: data.currentCode });
  }

  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void replay()}
        disabled={busy}
        data-variant="green"
        className={compact ? "hist-rb hist-rep font-pixel" : "pixel-btn h-10 gap-2 px-3 text-[9px]"}
      >
        {compact ? <i className="hist-tri" aria-hidden="true" /> : <HistoryIcon name="replay" />}
        {t("hist.replay")}
      </button>
      {problem && (
        <span role="alert" className="text-lg text-[#f39a8c]">
          {problem.text}{" "}
          {problem.currentCode && (
            <Link href={`/jouer/${problem.currentCode}`} className="underline">
              {problem.currentCode}
            </Link>
          )}
        </span>
      )}
    </span>
  );
}
